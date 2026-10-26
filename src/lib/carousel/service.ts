import "server-only";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getManual, getVoiceProfile } from "@/lib/brujula/service";
import { db } from "@/lib/db";
import { carousels, jobs } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs";
import { getKit, normalizePhoto, PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/kit/service";
import { getPiece } from "@/lib/plan/service";
import { runCarrusel } from "@/lib/skills";
import { deleteObject, getObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { mockCarrusel, mockIdeas, mockInterview, mockSlide } from "./mock";
import {
  briefSchema,
  carruselOutput,
  ideasOutput,
  imageStats,
  interviewAnswersSchema,
  interviewOutput,
  MAX_AI_IMAGES,
  MAX_FULL_REDO,
  MAX_IDEA_REFRESH,
  MAX_OWN_PHOTOS,
  MAX_SLIDE_ATTEMPTS,
  needsInterview,
  normalizeCarousel,
  slideOutput,
  textEditSchema,
  usesImage,
  type Brief,
  type CarruselOut,
  type Idea,
  type InterviewAnswers,
  type InterviewOut,
  type Slide,
} from "./schemas";
import { z } from "zod";

export type CarouselRow = typeof carousels.$inferSelect;
type Result = { ok: true } | { ok: false; error: string };
type ImageMap = Record<string, { key: string; focalX: number; focalY: number }>;
type IdeaRound = { items: Idea[]; note: string | null; tipo_recomendado: string | null; porque_tipo: string | null };

/* ───────────── Lectura ───────────── */

export async function getCarousel(userId: string, id: string): Promise<CarouselRow | null> {
  const [r] = await db().select().from(carousels).where(and(eq(carousels.id, id), eq(carousels.userId, userId))).limit(1);
  return r ?? null;
}
export const listCarousels = (userId: string) => db().select().from(carousels).where(eq(carousels.userId, userId)).orderBy(desc(carousels.createdAt));

export const parseBrief = (raw: unknown): Brief | null => {
  const r = briefSchema.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseContent = (raw: unknown): CarruselOut | null => {
  const r = carruselOutput.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseInterview = (raw: unknown): InterviewOut | null => {
  const r = interviewOutput.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseAnswers = (raw: unknown): InterviewAnswers | null => {
  const r = interviewAnswersSchema.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseIdeaRounds = (raw: unknown): IdeaRound[] => (Array.isArray(raw) ? (raw as IdeaRound[]).filter((x) => x && Array.isArray(x.items)) : []);
export const parseImages = (raw: unknown): ImageMap => (raw && typeof raw === "object" ? (raw as ImageMap) : {});
const attemptsOf = (raw: unknown): Record<string, number> => (raw && typeof raw === "object" ? (raw as Record<string, number>) : {});

export type Step = "ideas" | "entrevista" | "carrusel";
export function stepOf(c: CarouselRow): Step {
  if (c.content) return "carrusel";
  if (c.chosen && needsInterview(parseBrief(c.brief)!) && !c.answers) return "entrevista";
  return "ideas";
}

/* ───────────── Contexto que se manda a la skill ───────────── */

async function context(userId: string) {
  const [manual, kit, voice] = await Promise.all([getManual(userId).catch(() => null), getKit(userId).catch(() => null), getVoiceProfile(userId).catch(() => null)]);
  const n = manual?.content.nicho;
  return {
    brujula: { nicho: typeof n === "string" ? n : (n?.principal ?? ""), pilares: manual?.content.pilares.map((p) => p.nombre) ?? [], palabras_no: manual?.content.palabras_no ?? [], tono: manual?.content.tono ?? null },
    kit_visual: kit?.final ?? null,
    perfil_voz: voice?.content ?? {},
    reglas_aprendidas: [] as string[],
  };
}

/* ───────────── Pasos ───────────── */

async function runIdeas(userId: string, brief: Brief, ctx: Awaited<ReturnType<typeof context>>, nota?: string, rechazadas?: Idea[]) {
  return runCarrusel(userId, { modo: "ideas", creador_id: userId, ...ctx, brief, ...(nota ? { nota_refresh: nota, ideas_descartadas: rechazadas } : {}) }, ideasOutput, () => mockIdeas(brief));
}

async function prepareBrief(userId: string, raw: unknown, pieceId?: string | null): Promise<{ ok: true; brief: Brief; linked: string | null } | { ok: false; error: string }> {
  const parsed = briefSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos del carrusel." };
  const brief = parsed.data;
  if (brief.objetivo === "leads" && !brief.palabra_clave) return { ok: false, error: "Escribe la palabra clave para que te escriban (por ejemplo CREA)." };
  let linked: string | null = null;
  if (pieceId) {
    const p = await getPiece(userId, pieceId);
    if (!p || p.kind !== "carrusel") return { ok: false, error: "Esa pieza no existe." };
    linked = p.id;
  }
  return { ok: true, brief, linked };
}

/** Crea el carrusel YA (para que exista aunque salgas de la app) y pide las ideas en segundo plano. */
export async function startCarousel(userId: string, raw: unknown, pieceId?: string | null): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const p = await prepareBrief(userId, raw, pieceId);
  if (!p.ok) return p;
  const [{ n }] = await db().select({ n: count() }).from(carousels).where(eq(carousels.userId, userId));
  const [row] = await db().insert(carousels).values({ userId, pieceId: p.linked, number: (n ?? 0) + 1, brief: p.brief, ideas: [] }).returning({ id: carousels.id });
  await enqueue("carrusel.paso", userId, { id: row!.id, op: "ideas", args: {} }, { maxAttempts: 1 });
  return { ok: true, id: row!.id };
}

export async function createCarousel(userId: string, raw: unknown, pieceId?: string | null): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const prep = await prepareBrief(userId, raw, pieceId);
  if (!prep.ok) return prep;
  const { brief, linked } = prep;
  const ctx = await context(userId);
  const r = await runIdeas(userId, brief, ctx);
  const [{ n }] = await db().select({ n: count() }).from(carousels).where(eq(carousels.userId, userId));
  const round: IdeaRound = { items: r.output.ideas, note: null, tipo_recomendado: r.output.tipo_recomendado, porque_tipo: r.output.porque_tipo };
  const [row] = await db().insert(carousels).values({ userId, pieceId: linked, number: (n ?? 0) + 1, brief, ideas: [round], mock: r.mock }).returning({ id: carousels.id });
  return { ok: true, id: row!.id };
}

/** Las ideas de un carrusel recién creado (corre en el worker). */
export async function initialIdeas(userId: string, id: string): Promise<Result> {
  const c = await getCarousel(userId, id);
  const brief = c && parseBrief(c.brief);
  if (!c || !brief) return { ok: false, error: "No encontramos ese carrusel." };
  const r = await runIdeas(userId, brief, await context(userId));
  const round: IdeaRound = { items: r.output.ideas, note: null, tipo_recomendado: r.output.tipo_recomendado, porque_tipo: r.output.porque_tipo };
  await db().update(carousels).set({ ideas: [round], mock: r.mock }).where(eq(carousels.id, id));
  return { ok: true };
}

/* ───────────── Pasos con IA en segundo plano ───────────── */

export type CarouselOp = "ideas" | "otras" | "elegir" | "respuestas" | "rehacer" | "slide" | "imagen" | "imagenes";
export const OP_LABEL: Record<CarouselOp, { title: string; text: string }> = {
  ideas: { title: "Pensando ideas para tu carrusel…", text: "Estamos escribiendo varias ideas con tu marca y tu voz." },
  otras: { title: "Buscando otras ideas…", text: "Armando una nueva ronda a partir de lo que no te convenció." },
  elegir: { title: "Preparando tu carrusel…", text: "Con la idea que elegiste armamos las preguntas o el carrusel completo." },
  respuestas: { title: "Armando tu carrusel…", text: "Escribiendo cada slide con tu estilo." },
  rehacer: { title: "Rehaciendo tu carrusel…", text: "Escribiendo de nuevo todos los slides con tu nota." },
  slide: { title: "Reescribiendo el slide…", text: "Cambiando solo ese slide." },
  imagen: { title: "Creando la imagen con IA…", text: "Dibujando la imagen de este slide y colocándola sola." },
  imagenes: { title: "Creando tus imágenes con IA…", text: "Dibujando las imágenes de tus slides y colocándolas solas. Tarda unos minutos." },
};
const CAROUSEL_JOB_STALE_MS = 15 * 60 * 1000;

export type CarouselJob = { status: "pendiente" | "corriendo" | "lista" | "error"; error: string | null; op: CarouselOp; createdAt: Date; active: boolean; recent: boolean };

/** El último paso con IA pedido para este carrusel (null si no hay). */
export async function latestCarouselJob(userId: string, id: string): Promise<CarouselJob | null> {
  const [row] = await db()
    .select({ status: jobs.status, error: jobs.error, payload: jobs.payload, createdAt: jobs.createdAt })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.kind, "carrusel.paso"), sql`${jobs.payload}->>'id' = ${id}`))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  if (!row) return null;
  const recent = Date.now() - row.createdAt.getTime() < CAROUSEL_JOB_STALE_MS;
  return { status: row.status, error: row.error, op: ((row.payload as { op?: CarouselOp }).op ?? "ideas") as CarouselOp, createdAt: row.createdAt, recent, active: recent && (row.status === "pendiente" || row.status === "corriendo") };
}

/** Pide un paso con IA para que corra en el worker (así sigue aunque cierres la app) y la página lo muestra con su avance. */
export async function queueCarouselOp(userId: string, id: string, op: CarouselOp, args: Record<string, unknown> = {}): Promise<Result> {
  const c = await getCarousel(userId, id);
  if (!c) return { ok: false, error: "No encontramos ese carrusel." };
  const [active] = await db()
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.kind, "carrusel.paso"), sql`${jobs.payload}->>'id' = ${id}`, inArray(jobs.status, ["pendiente", "corriendo"]), gt(jobs.createdAt, new Date(Date.now() - CAROUSEL_JOB_STALE_MS))))
    .limit(1);
  if (active) return { ok: false, error: "Ya estamos trabajando en este carrusel. Espera a que termine." };
  await enqueue("carrusel.paso", userId, { id, op, args }, { maxAttempts: 1 });
  return { ok: true };
}

/** Lo que corre el worker: el mismo paso de siempre; si no se pudo, el trabajo queda en error con su motivo. */
export async function runCarouselOp(userId: string, payload: { id: string; op: CarouselOp; args?: Record<string, unknown> }): Promise<void> {
  const { id, op } = payload;
  const a = payload.args ?? {};
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  let r: Result;
  if (op === "ideas") r = await initialIdeas(userId, id);
  else if (op === "otras") r = await refreshIdeas(userId, id, s("nota"));
  else if (op === "elegir") r = await chooseIdea(userId, id, { ideaId: s("idea"), own: s("propia") });
  else if (op === "respuestas") r = await saveAnswers(userId, id, a.answers);
  else if (op === "rehacer") r = await generateCarousel(userId, id, s("nota") || undefined);
  else if (op === "slide") r = await rewriteSlide(userId, id, Number(a.n), s("nota"));
  else if (op === "imagen") r = await (await import("./ai-images")).generateSlideImage(userId, id, Number(a.n));
  else if (op === "imagenes") r = await (await import("./ai-images")).generateAllImages(userId, id);
  else r = { ok: false, error: "Paso desconocido." };
  if (!r.ok) throw new Error(r.error);
}

export async function refreshIdeas(userId: string, id: string, nota: string): Promise<Result> {
  const c = await getCarousel(userId, id);
  const brief = c && parseBrief(c.brief);
  if (!c || !brief) return { ok: false, error: "No encontramos ese carrusel." };
  if (c.chosen) return { ok: false, error: "Ya elegiste una idea." };
  const rounds = parseIdeaRounds(c.ideas);
  if (rounds.length > MAX_IDEA_REFRESH) return { ok: false, error: "Ya pediste otras ideas dos veces. Escribe la tuya o elige una de las anteriores." };
  const r = await runIdeas(userId, brief, await context(userId), nota.slice(0, 300), rounds.flatMap((x) => x.items));
  await db().update(carousels).set({ ideas: [...rounds, { items: r.output.ideas, note: nota.slice(0, 300), tipo_recomendado: null, porque_tipo: null }], mock: c.mock && r.mock }).where(eq(carousels.id, id));
  return { ok: true };
}

/** El creador escribe su propia idea cuando ya no quiere más rondas. */
export async function chooseIdea(userId: string, id: string, pick: { ideaId?: string; own?: string }): Promise<Result> {
  const c = await getCarousel(userId, id);
  const brief = c && parseBrief(c.brief);
  if (!c || !brief) return { ok: false, error: "No encontramos ese carrusel." };
  let idea: Idea | undefined;
  if (pick.own?.trim()) idea = { id: "propia", angulo: "propia", titulo: pick.own.trim().slice(0, 100), promesa: "" };
  else idea = parseIdeaRounds(c.ideas).flatMap((x) => x.items).find((i) => i.id === pick.ideaId);
  if (!idea) return { ok: false, error: "Elige una de las ideas." };
  await db().update(carousels).set({ chosen: idea, interview: null, answers: null, content: null }).where(eq(carousels.id, id));
  if (needsInterview(brief)) {
    const r = await runCarrusel(userId, { modo: "entrevista_ia", creador_id: userId, ...(await context(userId)), brief, idea_elegida: idea }, interviewOutput, () => mockInterview());
    await db().update(carousels).set({ interview: r.output }).where(eq(carousels.id, id));
    return { ok: true };
  }
  return generateCarousel(userId, id);
}

export async function saveAnswers(userId: string, id: string, raw: unknown): Promise<Result> {
  const c = await getCarousel(userId, id);
  if (!c || !c.chosen) return { ok: false, error: "Primero elige una idea." };
  const a = interviewAnswersSchema.safeParse(raw);
  if (!a.success) return { ok: false, error: "Revisa tus respuestas." };
  if (a.data.narracion.trim().length < 3) return { ok: false, error: "Cuéntanos con tus palabras cómo te imaginas la portada." };
  await db().update(carousels).set({ answers: a.data }).where(eq(carousels.id, id));
  return generateCarousel(userId, id);
}

/** Genera (o rehace) el carrusel completo. Rehacerlo tiene tope: la versión anterior queda mientras tanto. */
export async function generateCarousel(userId: string, id: string, nota?: string): Promise<Result> {
  const c = await getCarousel(userId, id);
  const brief = c && parseBrief(c.brief);
  if (!c || !brief || !c.chosen) return { ok: false, error: "Primero elige una idea." };
  if (c.content && c.fullRedos >= MAX_FULL_REDO) return { ok: false, error: "Ya rehiciste el carrusel completo dos veces. Cambia slide por slide." };
  const ctx = await context(userId);
  const answers = parseAnswers(c.answers);
  const style = answers && answers.estilo !== "elige_por_mi" ? answers.estilo : null;
  const input = { modo: "carrusel", creador_id: userId, ...ctx, brief, idea_elegida: c.chosen, ...(answers ? { entrevista_ia: answers } : {}), numero_carrusel: c.number, ...(c.content && nota ? { carrusel_actual: c.content, nota_refresh: nota.slice(0, 300) } : {}) };
  const r = await runCarrusel(userId, input, carruselOutput, () => mockCarrusel({ brief, titulo: (c.chosen as Idea).titulo, kit: ctx.kit_visual ? { fondo: ctx.kit_visual.colores.fondo, acento: ctx.kit_visual.colores.acento } : null, style }));
  const content = normalizeCarousel(r.output);
  await db().update(carousels).set({ content, mock: r.mock, slideAttempts: {}, fullRedos: c.content ? c.fullRedos + 1 : 0, background: content.fondo_slides_texto?.recomendado ?? "blanco" }).where(eq(carousels.id, id));
  return { ok: true };
}

/* ───────────── Edición (nivel 1: sin IA; nivel 2: un slide con IA) ───────────── */

async function mutateContent(userId: string, id: string, fn: (c: CarruselOut, row: CarouselRow) => CarruselOut | string): Promise<Result> {
  const row = await getCarousel(userId, id);
  const content = row && parseContent(row.content);
  if (!row || !content) return { ok: false, error: "Ese carrusel todavía no tiene slides." };
  const next = fn(content, row);
  if (typeof next === "string") return { ok: false, error: next };
  await db().update(carousels).set({ content: next }).where(eq(carousels.id, id));
  return { ok: true };
}

export const editSlide = (userId: string, id: string, n: number, raw: unknown) => {
  const e = textEditSchema.safeParse(raw);
  if (!e.success) return Promise.resolve<Result>({ ok: false, error: e.error.issues[0]?.message ?? "Revisa el texto." });
  return mutateContent(userId, id, (c) => {
    if (!c.slides.some((s) => s.n === n)) return "Ese slide no existe.";
    const wordsCount = (e.data.cuerpo ?? "").split(/\s+/).filter(Boolean).length;
    if (wordsCount > 45) return "El cuerpo es muy largo: máximo unas 30 palabras por slide.";
    return { ...c, slides: c.slides.map((s) => (s.n === n ? { ...s, titulo: e.data.titulo, cuerpo: e.data.cuerpo || null, resaltar: e.data.resaltar || null, plantilla: e.data.plantilla } : s)) };
  });
};

export const moveSlide = (userId: string, id: string, n: number, dir: "up" | "down") =>
  mutateContent(userId, id, (c) => {
    const i = c.slides.findIndex((s) => s.n === n);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 1 || j < 1 || j >= c.slides.length) return "Ese slide no se puede mover más (la portada siempre va primero).";
    const slides = [...c.slides];
    [slides[i], slides[j]] = [slides[j]!, slides[i]!];
    return { ...c, slides: slides.map((s, k) => ({ ...s, n: k + 1 })) };
  }).then(async (r) => {
    if (r.ok) await remapImages(userId, id, n, dir);
    return r;
  });

/** Las imágenes siguen a su slide cuando se reordena (la llave de cada una es el número de slide). */
async function remapImages(userId: string, id: string, n: number, dir: "up" | "down") {
  const row = await getCarousel(userId, id);
  if (!row) return;
  const imgs = parseImages(row.images);
  const a = String(n);
  const b = String(dir === "up" ? n - 1 : n + 1);
  const next = { ...imgs };
  delete next[a];
  delete next[b];
  if (imgs[a]) next[b] = imgs[a]!;
  if (imgs[b]) next[a] = imgs[b]!;
  await db().update(carousels).set({ images: next }).where(eq(carousels.id, id));
}

export async function setBackground(userId: string, id: string, bg: string): Promise<Result> {
  const row = await getCarousel(userId, id);
  const content = row && parseContent(row.content);
  if (!row || !content) return { ok: false, error: "No encontramos ese carrusel." };
  if (!content.fondo_slides_texto?.opciones.some((o) => o.id === bg)) return { ok: false, error: "Ese fondo no existe." };
  await db().update(carousels).set({ background: bg }).where(eq(carousels.id, id));
  return { ok: true };
}

/** Nivel 2: rehace UN slide con la nota del creador (máximo 3 intentos por slide). */
export async function rewriteSlide(userId: string, id: string, n: number, nota: string): Promise<Result> {
  const row = await getCarousel(userId, id);
  const content = row && parseContent(row.content);
  const brief = row && parseBrief(row.brief);
  const slide = content?.slides.find((s) => s.n === n);
  if (!row || !content || !brief || !slide) return { ok: false, error: "Ese slide no existe." };
  const attempts = attemptsOf(row.slideAttempts);
  const used = attempts[String(n)] ?? 0;
  if (used >= MAX_SLIDE_ATTEMPTS) return { ok: false, error: "Ya usaste los 3 intentos de este slide. Edítalo a mano." };
  if (nota.trim().length < 3) return { ok: false, error: "Cuéntanos qué no te gustó." };
  const ctx = await context(userId);
  const r = await runCarrusel(userId, { modo: "slide", creador_id: userId, ...ctx, brief, carrusel_actual: content, slide_a_cambiar: { n, nota: nota.slice(0, 300), intento: used + 1 } }, slideOutput, () => mockSlide(slide, nota));
  const next: CarruselOut = { ...content, slides: content.slides.map((s) => (s.n === n ? { ...r.output.slide, n } : s)) };
  await db().update(carousels).set({ content: next, slideAttempts: { ...attempts, [String(n)]: used + 1 } }).where(eq(carousels.id, id));
  return { ok: true };
}

export const attemptsLeft = (row: CarouselRow, n: number) => MAX_SLIDE_ATTEMPTS - (attemptsOf(row.slideAttempts)[String(n)] ?? 0);

/* ───────────── Imágenes de cada slide ───────────── */

export async function addImage(userId: string, id: string, n: number, raw: Buffer, declaredType: string): Promise<Result> {
  if (!storageConfigured()) return { ok: false, error: "El almacenamiento no está configurado." };
  const row = await getCarousel(userId, id);
  const content = row && parseContent(row.content);
  const slide = content?.slides.find((s) => s.n === n);
  if (!row || !content || !slide) return { ok: false, error: "Ese slide no existe." };
  const check = PHOTO_TYPES[declaredType as keyof typeof PHOTO_TYPES];
  if (!check || !check(raw)) return { ok: false, error: "La imagen debe ser JPG, PNG o WebP." };
  if (raw.length > PHOTO_MAX_BYTES) return { ok: false, error: "La imagen pesa demasiado (máximo 8 MB)." };
  let processed: { data: Buffer; contentType: string };
  try {
    processed = await normalizePhoto(raw);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const imgs = parseImages(row.images);
  const key = `carruseles/${userId}/${id}/${n}-${randomUUID()}.jpg`;
  await putObjectStream(key, Readable.from(processed.data), processed.contentType);
  const old = imgs[String(n)];
  await db().update(carousels).set({ images: { ...imgs, [String(n)]: { key, focalX: old?.focalX ?? 50, focalY: old?.focalY ?? 50 } } }).where(eq(carousels.id, id));
  if (old) await deleteObject(old.key).catch(() => undefined);
  return { ok: true };
}

export async function removeImage(userId: string, id: string, n: number): Promise<Result> {
  const row = await getCarousel(userId, id);
  if (!row) return { ok: false, error: "No encontramos ese carrusel." };
  const imgs = parseImages(row.images);
  const old = imgs[String(n)];
  if (!old) return { ok: true };
  const next = { ...imgs };
  delete next[String(n)];
  await db().update(carousels).set({ images: next }).where(eq(carousels.id, id));
  await deleteObject(old.key).catch(() => undefined);
  return { ok: true };
}

const focalSchema = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) });
export async function setFocal(userId: string, id: string, n: number, raw: { x: number; y: number }): Promise<Result> {
  const f = focalSchema.safeParse(raw);
  const row = await getCarousel(userId, id);
  const imgs = row ? parseImages(row.images) : {};
  if (!f.success || !row || !imgs[String(n)]) return { ok: false, error: "No se pudo mover la imagen." };
  await db().update(carousels).set({ images: { ...imgs, [String(n)]: { ...imgs[String(n)]!, focalX: f.data.x, focalY: f.data.y } } }).where(eq(carousels.id, id));
  return { ok: true };
}

export async function readImage(userId: string, id: string, n: number) {
  const row = await getCarousel(userId, id);
  const img = row ? parseImages(row.images)[String(n)] : null;
  if (!img || !storageConfigured()) return null;
  return getObject(img.key);
}

export async function deleteCarousel(userId: string, id: string): Promise<void> {
  const row = await getCarousel(userId, id);
  if (!row) return;
  for (const img of Object.values(parseImages(row.images))) await deleteObject(img.key).catch(() => undefined);
  await (await import("./animate-service")).deleteAnimationFiles(userId, id);
  await db().delete(carousels).where(eq(carousels.id, id));
}

/** Resumen para avisar si el carrusel se pasa de imágenes que pide la skill (regla 12 y 22). */
export function imageWarnings(content: CarruselOut): string[] {
  const s = imageStats(content.slides);
  const out: string[] = [];
  if (s.own > MAX_OWN_PHOTOS) out.push(`Pide ${s.own} fotos tuyas; lo ideal es ${MAX_OWN_PHOTOS} o menos.`);
  if (s.ai > MAX_AI_IMAGES) out.push(`Tiene ${s.ai} imágenes de IA; el máximo recomendado es ${MAX_AI_IMAGES}.`);
  return out;
}

export { usesImage };
export type { Slide };

/** Lo que el creador eligió en su carrusel anterior (estilo de imágenes, si sale él y herramienta): su línea visual es solo suya (regla 30b). */
export async function previousAnswers(userId: string, exceptId: string): Promise<{ estilo: string; aparece_creador: string; herramienta: string } | null> {
  const rows = await db().select({ id: carousels.id, answers: carousels.answers }).from(carousels).where(eq(carousels.userId, userId)).orderBy(desc(carousels.createdAt)).limit(10);
  for (const r of rows) {
    if (r.id === exceptId || !r.answers) continue;
    const a = interviewAnswersSchema.safeParse(r.answers);
    if (a.success) return { estilo: a.data.estilo, aparece_creador: a.data.aparece_creador, herramienta: a.data.herramienta };
  }
  return null;
}
