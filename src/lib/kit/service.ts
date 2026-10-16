import "server-only";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getIntake, getManual } from "@/lib/brujula/service";
import { db } from "@/lib/db";
import { kitPhotos, kitVisual } from "@/lib/db/schema";
import { runKitFinal, runKitRound } from "@/lib/skills";
import { deleteObject, getObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { manualPalettes, manualTitleStyles, mockKitFinal, mockKitRound, type KitInput } from "./mock";
import {
  checkFinalKit,
  ELEMENT_IDS,
  finalKitSchema,
  keepAllowedFonts,
  keepReadablePalettes,
  MAX_ELEMENTS,
  MAX_PIECE_ADJUSTMENTS,
  PIECE_IDS,
  type ElementId,
  type FinalKit,
  type FontOption,
  type PaletteOption,
  type PieceId,
  type TitleOption,
} from "./schemas";
import { ALL_FONTS, TEXT_FONTS, textFont, titleFont } from "./fonts";

export const MAX_REFRESH = 2;
export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 4;
export const ROUND_TITLES: Record<number, string> = { 1: "Tu paleta", 2: "Afina tus colores", 3: "Tus tipografías", 4: "Estilo de tus títulos", 5: "Elementos gráficos" };

/* ───────────── Estado guardado ───────────── */

const roundSchema = z.object({ tandas: z.array(z.array(z.unknown())), chosen: z.array(z.unknown()).nullable().default(null), refreshes: z.number().int().default(0) });
const voteSchema = z.object({ voto: z.enum(["si", "no", "pendiente"]), motivos: z.array(z.string()), nota: z.string(), ajustes: z.number().int(), noUsar: z.boolean().default(false) });
const stateSchema = z.object({
  r1: roundSchema.optional(),
  r2: roundSchema.optional(),
  r3: roundSchema.optional(),
  r4: roundSchema.optional(),
  elementos: z.array(z.enum(ELEMENT_IDS)).optional(),
  final: z.unknown().optional(),
  votes: z.record(z.string(), voteSchema).optional(),
});
export type KitState = z.infer<typeof stateSchema>;
export type Round = z.infer<typeof roundSchema>;
type RoundKey = "r1" | "r2" | "r3" | "r4";
const rkey = (n: number) => `r${n}` as RoundKey;

export type Photo = { id: string; contentType: string; size: number };
export type KitData = { state: KitState; final: FinalKit | null; photos: Photo[]; mock: boolean; approvedAt: Date | null; updatedAt: Date | null };

export async function getKit(userId: string): Promise<KitData> {
  const [row] = await db().select().from(kitVisual).where(eq(kitVisual.userId, userId)).limit(1);
  const photos = await db().select({ id: kitPhotos.id, contentType: kitPhotos.contentType, size: kitPhotos.size }).from(kitPhotos).where(eq(kitPhotos.userId, userId)).orderBy(kitPhotos.createdAt);
  const parsed = stateSchema.safeParse(row?.state ?? {});
  const state = parsed.success ? parsed.data : {};
  const fin = state.final ? finalKitSchema.safeParse(state.final) : null;
  return { state, final: fin?.success ? fin.data : null, photos, mock: row?.mock ?? false, approvedAt: row?.approvedAt ?? null, updatedAt: row?.updatedAt ?? null };
}

/** Guarda el estado solo si nadie lo cambió mientras se hablaba con la IA (control optimista). */
async function saveState(userId: string, expected: Date | null, state: KitState, mock: boolean, approved?: boolean): Promise<boolean> {
  const values = { state, mock, ...(approved !== undefined ? { approvedAt: approved ? new Date() : null } : {}), updatedAt: new Date() };
  if (!expected) {
    const r = await db().insert(kitVisual).values({ userId, ...values }).onConflictDoNothing().returning({ id: kitVisual.userId });
    return r.length > 0;
  }
  const r = await db().update(kitVisual).set(values).where(and(eq(kitVisual.userId, userId), eq(kitVisual.updatedAt, expected))).returning({ id: kitVisual.userId });
  return r.length > 0;
}

export const CONFLICT = "Se actualizó en otra pestaña. Recarga la página e inténtalo de nuevo.";

/* ───────────── Progreso ───────────── */

export type KitStage = 1 | 2 | 3 | 4 | 5 | "fotos" | "revelacion" | "listo";

export function kitStage(k: KitData): KitStage {
  for (const n of [1, 2, 3, 4] as const) if (!k.state[rkey(n)]?.chosen) return n;
  if (!k.state.elementos) return 5;
  if (k.approvedAt) return "listo";
  if (!k.final) return k.photos.length >= MIN_PHOTOS ? "revelacion" : "fotos";
  return "revelacion";
}

export function kitProgress(k: KitData) {
  const roundsDone = ([1, 2, 3, 4] as const).filter((n) => k.state[rkey(n)]?.chosen).length + (k.state.elementos ? 1 : 0);
  return { roundsDone, roundsTotal: 5, stage: kitStage(k), approved: Boolean(k.approvedAt) };
}

/* ───────────── Entrada de la skill ───────────── */

/** Frase de muestra para las vistas previas: la frase de marca si ya existe, o la primera frase de su presentación. */
export async function getHook(userId: string): Promise<string> {
  const [intake, manual] = await Promise.all([getIntake(userId), getManual(userId)]);
  const a = intake?.story.steps.calentamiento;
  const t = a && !a.skipped ? a.text : "";
  const first = (t.split(/(?<=[.!?])\s+/)[0] ?? "").split(/\s+/).slice(0, 14).join(" ");
  return manual?.content.frase_de_marca || first || "Empieza chiquito, pero empieza";
}


async function buildInput(userId: string, name: string, k: KitData, round: number, refresh: { numero: number; nota: string | null; rechazadas: unknown[] }, modo: "ronda" | "final", votes: KitInput["calificaciones_revelacion"] = []): Promise<KitInput> {
  const [intake, hook] = await Promise.all([getIntake(userId), getHook(userId)]);
  const previas: KitInput["elecciones_previas"] = [];
  for (const n of [1, 2, 3, 4] as const) {
    for (const opt of k.state[rkey(n)]?.chosen ?? []) previas.push({ ronda: n, eligio: String((opt as { id?: string }).id ?? ""), opcion: opt });
  }
  for (const id of k.state.elementos ?? []) previas.push({ ronda: 5, eligio: id, opcion: { id } });
  return {
    modo,
    numero_ronda: round,
    creador_id: userId,
    auditoria: null,
    respuestas_tarjetas: [],
    tono_elegido: intake?.quick?.tono ?? [],
    gancho_muestra: hook,
    elecciones_previas: previas,
    calificaciones_revelacion: votes,
    refresh: { numero: refresh.numero, nota: refresh.nota, opciones_rechazadas: refresh.rechazadas },
  };
}

const LETTERS = "ABCDEFGH";

/** Aplica las validaciones por código y completa con opciones de prueba si la IA dejó muy pocas (nunca se queda atorado). */
function sanitize(n: number, raw: unknown[], input: KitInput): (PaletteOption | FontOption | TitleOption)[] {
  const need = n === 1 ? 2 : 4;
  let kept: (PaletteOption | FontOption | TitleOption)[] = n <= 2 ? keepReadablePalettes(raw as PaletteOption[]) : n === 3 ? keepAllowedFonts(raw as FontOption[]) : (raw as TitleOption[]);
  if (kept.length < need) {
    const extra = mockKitRound({ ...input, refresh: { ...input.refresh, opciones_rechazadas: [] } });
    const have = new Set(kept.map((o) => JSON.stringify(n <= 2 ? (o as PaletteOption).colores : n === 3 ? [(o as FontOption).titulos, (o as FontOption).texto] : (o as TitleOption).nombre)));
    for (const o of extra) {
      const k = JSON.stringify(n <= 2 ? (o as PaletteOption).colores : n === 3 ? [(o as FontOption).titulos, (o as FontOption).texto] : (o as TitleOption).nombre);
      if (!have.has(k) && kept.length < need) {
        kept = [...kept, o];
        have.add(k);
      }
    }
  }
  return kept.slice(0, need === 2 ? 2 : 4).map((o, i) => ({ ...o, id: LETTERS[i]! }));
}

/* ───────────── Rondas 1 a 4 ───────────── */

/** Devuelve la ronda; la genera con la skill la primera vez que se visita. */
export async function ensureRound(userId: string, name: string, n: 1 | 2 | 3 | 4): Promise<{ round: Round; error?: string }> {
  const k = await getKit(userId);
  const existing = k.state[rkey(n)];
  if (existing && existing.tandas.length > 0) return { round: existing };

  const input = await buildInput(userId, name, k, n, { numero: 0, nota: null, rechazadas: [] }, "ronda");
  const res = await runKitRound(userId, input);
  const options = sanitize(n, res.output.options as unknown[], input);
  const round: Round = { tandas: [options], chosen: null, refreshes: 0 };
  const ok = await saveState(userId, k.updatedAt, { ...k.state, [rkey(n)]: round }, k.mock || res.mock);
  if (!ok) return { round: (await getKit(userId)).state[rkey(n)] ?? round, error: CONFLICT };
  return { round };
}

/** Elige una o dos opciones (ronda 4 permite 2). Los valores son "tanda:id". */
export async function chooseOptions(userId: string, n: 1 | 2 | 3 | 4, values: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const k = await getKit(userId);
  const round = k.state[rkey(n)];
  if (!round) return { ok: false, error: "Esta ronda todavía no empieza." };
  const max = n === 4 ? 2 : 1;
  if (values.length < 1 || values.length > max) return { ok: false, error: n === 4 ? "Elige 1 o 2 estilos." : "Elige una opción." };
  const chosen: unknown[] = [];
  for (const v of new Set(values)) {
    const [t, id] = v.split(":");
    const opt = round.tandas[Number(t)]?.find((o) => (o as { id?: string }).id === id);
    if (!opt) return { ok: false, error: "Esa opción ya no existe." };
    chosen.push(opt);
  }
  // Cambiar una ronda anterior invalida lo que dependía de ella (kit final y revelación).
  const next: KitState = { ...k.state, [rkey(n)]: { ...round, chosen } };
  delete next.final;
  delete next.votes;
  const ok = await saveState(userId, k.updatedAt, next, k.mock, false);
  return ok ? { ok: true } : { ok: false, error: CONFLICT };
}

/** "Ninguna me convence": nuevas opciones sin borrar las anteriores. Máximo 2 por ronda. */
export async function refreshRound(userId: string, name: string, n: 1 | 2 | 3 | 4, note: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const k = await getKit(userId);
  const round = k.state[rkey(n)];
  if (!round) return { ok: false, error: "Esta ronda todavía no empieza." };
  if (round.refreshes >= MAX_REFRESH) return { ok: false, error: "Ya usaste los 2 cambios de esta ronda. Elige del selector manual." };

  const current = round.tandas[round.tandas.length - 1] ?? [];
  const rejected = round.tandas.flat();
  const input = await buildInput(userId, name, k, n, { numero: round.refreshes + 1, nota: note.slice(0, 300) || null, rechazadas: rejected.length ? rejected : current }, "ronda");
  const res = await runKitRound(userId, input);
  const options = sanitize(n, res.output.options as unknown[], input);
  const updated: Round = { ...round, tandas: [...round.tandas, options], refreshes: round.refreshes + 1, chosen: null };
  const ok = await saveState(userId, k.updatedAt, { ...k.state, [rkey(n)]: updated }, k.mock || res.mock);
  return ok ? { ok: true } : { ok: false, error: CONFLICT };
}

/** Selector manual (tras agotar los refrescos): el creador elige de una lista corta para no quedarse atorado. */
export async function chooseManual(userId: string, n: 1 | 2 | 3 | 4, pick: { preset?: string; titulos?: string; texto?: string; style?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const k = await getKit(userId);
  const round = k.state[rkey(n)];
  if (!round) return { ok: false, error: "Esta ronda todavía no empieza." };
  if (round.refreshes < MAX_REFRESH) return { ok: false, error: "El selector manual se habilita después de 2 cambios." };
  let option: PaletteOption | FontOption | TitleOption | undefined;
  if (n <= 2) option = manualPalettes().find((p) => p.id === pick.preset);
  else if (n === 3) {
    const t = titleFont(pick.titulos ?? "");
    const x = textFont(pick.texto ?? "");
    if (t && x) option = { id: "M", nombre: "Elegida por ti", titulos: t, texto: x, porque: "" };
  } else option = manualTitleStyles().find((s) => s.id === pick.style);
  if (!option) return { ok: false, error: "Elige una de las opciones de la lista." };
  const manual = { ...option, id: "M" };
  const next: KitState = { ...k.state, [rkey(n)]: { ...round, tandas: [...round.tandas, [manual]], chosen: [manual] } };
  delete next.final;
  delete next.votes;
  const ok = await saveState(userId, k.updatedAt, next, k.mock, false);
  return ok ? { ok: true } : { ok: false, error: CONFLICT };
}

export const MANUAL_FONT_LISTS = { titulos: ALL_FONTS, texto: [...TEXT_FONTS] as string[] };

/* ───────────── Ronda 5 · elementos (biblioteca fija, sin IA) ───────────── */

export async function chooseElements(userId: string, ids: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const valid = [...new Set(ids)].filter((i): i is ElementId => (ELEMENT_IDS as string[]).includes(i));
  if (valid.length !== new Set(ids).size) return { ok: false, error: "Elemento no válido." };
  if (valid.length > MAX_ELEMENTS) return { ok: false, error: `Elige máximo ${MAX_ELEMENTS}.` };
  const k = await getKit(userId);
  const next: KitState = { ...k.state, elementos: valid };
  delete next.final;
  delete next.votes;
  const ok = await saveState(userId, k.updatedAt, next, k.mock, false);
  return ok ? { ok: true } : { ok: false, error: CONFLICT };
}

/** Si abandona a medias, se toma la opción A de cada ronda faltante (nota técnica de la skill). */
export async function fillDefaults(userId: string, name: string): Promise<void> {
  for (const n of [1, 2, 3, 4] as const) {
    let k = await getKit(userId);
    if (k.state[rkey(n)]?.chosen) continue;
    await ensureRound(userId, name, n);
    k = await getKit(userId);
    const first = k.state[rkey(n)]?.tandas.at(-1)?.[0];
    if (first) await chooseOptions(userId, n, [`${(k.state[rkey(n)]?.tandas.length ?? 1) - 1}:${(first as { id: string }).id}`]);
  }
  const k = await getKit(userId);
  if (!k.state.elementos) await chooseElements(userId, []);
}

/* ───────────── Revelación (kit final con fotos) ───────────── */

export type VoteInput = Partial<Record<PieceId, { voto: "si" | "no"; motivos: string[]; nota: string }>>;

function checked(kit: FinalKit, fallback: () => FinalKit): FinalKit {
  const r = checkFinalKit(kit);
  if (r.ok) return r.kit;
  console.error("[kit] el kit final no pasó las validaciones:", r.reason);
  return fallback();
}

export async function startReveal(userId: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const k = await getKit(userId);
  if (kitStage(k) === 5 || ([1, 2, 3, 4] as const).some((n) => !k.state[rkey(n)]?.chosen)) return { ok: false, error: "Termina primero las 5 rondas." };
  if (k.photos.length < MIN_PHOTOS) return { ok: false, error: `Sube al menos ${MIN_PHOTOS} fotos.` };
  const input = await buildInput(userId, name, k, 5, { numero: 0, nota: null, rechazadas: [] }, "final");
  const res = await runKitFinal(userId, input, null);
  const kit = checked(res.output, () => mockKitFinal(input, null));
  const votes = Object.fromEntries(PIECE_IDS.map((p) => [p, { voto: "pendiente" as const, motivos: [], nota: "", ajustes: 0, noUsar: false }]));
  const ok = await saveState(userId, k.updatedAt, { ...k.state, final: kit, votes }, k.mock || res.mock, false);
  return ok ? { ok: true } : { ok: false, error: CONFLICT };
}

/** Califica las 4 piezas. Con 👎 solo se ajusta ese tipo de pieza (máx. 3 ajustes); si sigue sin gustar, se marca "no usar". */
export async function submitVotes(userId: string, name: string, input: VoteInput): Promise<{ ok: true; approved: boolean } | { ok: false; error: string }> {
  const k = await getKit(userId);
  if (!k.final || !k.state.votes) return { ok: false, error: "Todavía no hay kit para calificar." };
  const votes = structuredClone(k.state.votes);
  const toAdjust: KitInput["calificaciones_revelacion"] = [];
  const prefs = [...k.final.preferencias_visuales];

  for (const id of PIECE_IDS) {
    const v = input[id];
    const cur = votes[id] ?? { voto: "pendiente" as const, motivos: [], nota: "", ajustes: 0, noUsar: false };
    if (cur.noUsar || !v) continue;
    if (v.voto === "si") {
      votes[id] = { ...cur, voto: "si", motivos: [], nota: "" };
      continue;
    }
    if (cur.ajustes >= MAX_PIECE_ADJUSTMENTS) {
      votes[id] = { ...cur, voto: "no", noUsar: true, motivos: v.motivos, nota: v.nota };
      prefs.push({ sobre: id, le_gusta: false, detalle: "No usar este tipo de pieza: no logró gustar tras 3 ajustes" });
      continue;
    }
    votes[id] = { ...cur, voto: "pendiente", motivos: v.motivos, nota: v.nota.slice(0, 300), ajustes: cur.ajustes + 1 };
    toAdjust.push({ pieza: id, voto: "no", motivos: v.motivos, nota: v.nota.slice(0, 300) || null });
  }

  let final = k.final;
  let mock = k.mock;
  if (toAdjust.length) {
    const inputSkill = await buildInput(userId, name, k, 5, { numero: 0, nota: null, rechazadas: [] }, "final", toAdjust);
    const res = await runKitFinal(userId, inputSkill, k.final);
    final = checked(res.output, () => mockKitFinal(inputSkill, k.final));
    mock = mock || res.mock;
  }
  final = { ...final, preferencias_visuales: prefs.length > final.preferencias_visuales.length ? [...final.preferencias_visuales.filter((p) => !prefs.some((q) => q.sobre === p.sobre && !q.le_gusta)), ...prefs.filter((p) => !p.le_gusta)] : final.preferencias_visuales };
  const approved = PIECE_IDS.every((id) => votes[id]?.voto === "si" || votes[id]?.noUsar);
  const ok = await saveState(userId, k.updatedAt, { ...k.state, final, votes }, mock, approved);
  return ok ? { ok: true, approved } : { ok: false, error: CONFLICT };
}

/** Rehacer el kit desde cero (conserva las fotos). */
export async function resetKit(userId: string): Promise<void> {
  await db().delete(kitVisual).where(eq(kitVisual.userId, userId));
}

/* ───────────── Fotos ───────────── */

const sig = {
  jpeg: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b: Buffer) => b[0] === 0x89 && b.subarray(1, 4).toString() === "PNG",
  webp: (b: Buffer) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
};
export const PHOTO_TYPES = { "image/jpeg": sig.jpeg, "image/png": sig.png, "image/webp": sig.webp } as const;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

/** Gira según la orientación, reduce a 1600 px y re-codifica en JPEG: así se quitan los metadatos (ubicación, cámara). */
export async function normalizePhoto(buf: Buffer): Promise<{ data: Buffer; contentType: string }> {
  try {
    const sharp = (await import("sharp")).default;
    const data = await sharp(buf, { failOn: "error" }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer();
    return { data, contentType: "image/jpeg" };
  } catch (err) {
    console.error("[kit] no se pudo procesar la foto con sharp; se rechaza", err instanceof Error ? err.message : err);
    throw new Error("No pudimos procesar esa foto. Prueba con otra.");
  }
}

export async function addPhoto(userId: string, raw: Buffer, declaredType: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!storageConfigured()) return { ok: false, error: "El almacenamiento no está configurado." };
  const check = PHOTO_TYPES[declaredType as keyof typeof PHOTO_TYPES];
  if (!check || !check(raw)) return { ok: false, error: "La foto debe ser JPG, PNG o WebP." };
  const [{ n }] = await db().select({ n: count() }).from(kitPhotos).where(eq(kitPhotos.userId, userId));
  if ((n ?? 0) >= MAX_PHOTOS) return { ok: false, error: `Máximo ${MAX_PHOTOS} fotos. Borra una para subir otra.` };
  let processed: { data: Buffer; contentType: string };
  try {
    processed = await normalizePhoto(raw);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const id = randomUUID();
  const key = `kit/${userId}/${id}.jpg`;
  await putObjectStream(key, Readable.from(processed.data), processed.contentType);
  await db().insert(kitPhotos).values({ id, userId, storageKey: key, contentType: processed.contentType, size: processed.data.length });
  return { ok: true, id };
}

export async function deletePhoto(userId: string, id: string): Promise<boolean> {
  const [row] = await db().select().from(kitPhotos).where(and(eq(kitPhotos.id, id), eq(kitPhotos.userId, userId))).limit(1);
  if (!row) return false;
  await db().delete(kitPhotos).where(eq(kitPhotos.id, row.id));
  await deleteObject(row.storageKey).catch(() => undefined);
  // Si había kit final armado con esas fotos, se vuelve a revelar con las que queden.
  const k = await getKit(userId);
  if (k.final && !k.approvedAt) {
    const next = { ...k.state };
    delete next.final;
    delete next.votes;
    await saveState(userId, k.updatedAt, next, k.mock);
  }
  return true;
}

export async function readPhoto(userId: string, id: string) {
  if (!storageConfigured()) return null;
  const [row] = await db().select().from(kitPhotos).where(and(eq(kitPhotos.id, id), eq(kitPhotos.userId, userId))).limit(1);
  if (!row) return null;
  const obj = await getObject(row.storageKey);
  return obj ? { body: obj.body, contentType: row.contentType, size: row.size } : null;
}

/** Datos para Hoy / Mi marca. */
export async function getKitOverview(userId: string) {
  const k = await getKit(userId);
  return { ...kitProgress(k), mock: k.mock, hasPhotos: k.photos.length, colors: k.final?.colores ?? null };
}

