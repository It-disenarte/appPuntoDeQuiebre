import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { geminiConfigured, geminiGenerate, parseJson } from "@/lib/ai/gemini";
import { getManual, getVoiceProfile } from "@/lib/brujula/service";
import { db } from "@/lib/db";
import { aiCalls, profileOpt } from "@/lib/db/schema";
import { getKit, normalizePhoto, PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/kit/service";
import { runPerfil } from "@/lib/skills";
import { deleteObject, getObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { mockPhoto, mockProfile, type ProfileCtx } from "./mock";
import {
  BIO_MAX,
  cleanBios,
  cleanHighlightName,
  currentSchema,
  MAX_PHOTOS,
  MAX_REFRESH,
  nameHasKeyword,
  NAME_MAX,
  photoOutput,
  profileOutput,
  votePartSchema,
  type Current,
  type PartVote,
  type PhotoScore,
  type ProfileOut,
  type ProfilePart,
} from "./schemas";

export type ProfileRow = typeof profileOpt.$inferSelect;
type Result = { ok: true } | { ok: false; error: string };
type Round = { options: string[]; note: string | null };
type Extra = { nombre?: Round[]; biografia?: Round[] };
type Stored = { key: string; at: string; result: PhotoScore; mock: boolean };

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const [r] = await db().select().from(profileOpt).where(eq(profileOpt.userId, userId)).limit(1);
  return r ?? null;
}
async function ensure(userId: string): Promise<ProfileRow> {
  await db().insert(profileOpt).values({ userId }).onConflictDoNothing();
  return (await getProfile(userId))!;
}

export const parseCurrent = (raw: unknown): Current | null => {
  const r = currentSchema.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseResult = (raw: unknown): ProfileOut | null => {
  const r = profileOutput.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseExtra = (raw: unknown): Extra => (raw && typeof raw === "object" ? (raw as Extra) : {});
export const parseVotes = (raw: unknown): Partial<Record<ProfilePart, PartVote>> => (raw && typeof raw === "object" ? (raw as Partial<Record<ProfilePart, PartVote>>) : {});
export const parseChosen = (raw: unknown): { nombre?: string; biografia?: string } => (raw && typeof raw === "object" ? (raw as { nombre?: string; biografia?: string }) : {});
export const parseApplied = (raw: unknown): Partial<Record<ProfilePart, boolean>> => (raw && typeof raw === "object" ? (raw as Partial<Record<ProfilePart, boolean>>) : {});
const refreshesOf = (raw: unknown): Record<string, number> => (raw && typeof raw === "object" ? (raw as Record<string, number>) : {});
export const parsePhotos = (raw: unknown): Stored[] => (Array.isArray(raw) ? (raw as Stored[]).filter((p) => p && typeof p.key === "string" && p.result) : []);

/* ───────────── Contexto ───────────── */

async function context(userId: string, current: Current): Promise<ProfileCtx & { raw: Record<string, unknown> }> {
  const [manual, voice, kit] = await Promise.all([getManual(userId).catch(() => null), getVoiceProfile(userId).catch(() => null), getKit(userId).catch(() => null)]);
  const n = manual?.content.nicho;
  const nicho = typeof n === "string" ? n : (n?.principal ?? "");
  const pilares = manual?.content.pilares.map((p) => p.nombre) ?? [];
  const colores = kit?.final ? { principal: kit.final.colores.principal, fondo: kit.final.colores.fondo, acento: kit.final.colores.acento } : null;
  return {
    current,
    nicho,
    propuesta: manual?.content.propuesta_valor ?? "",
    frase: manual?.content.frase_de_marca ?? "",
    pilares,
    colores,
    raw: {
      creador_id: userId,
      perfil_actual: current,
      brujula: { nicho: manual?.content.nicho ?? null, propuesta_valor: manual?.content.propuesta_valor ?? "", frase_de_marca: manual?.content.frase_de_marca ?? "", pilares: manual?.content.pilares ?? [], vision: manual?.content.vision ?? null, lives: manual?.content.lives ?? null },
      perfil_voz: { palabras_frecuentes: voice?.content.palabras_frecuentes ?? [], frases_firma: voice?.content.frases_firma ?? [] },
      kit_visual: kit?.final ? { colores: kit.final.colores, elementos: kit.final.elementos } : null,
      otras_redes: [],
    },
  };
}

/* ───────────── Perfil actual y propuestas ───────────── */

export async function saveCurrent(userId: string, raw: unknown): Promise<Result> {
  const c = currentSchema.safeParse(raw);
  if (!c.success) return { ok: false, error: c.error.issues[0]?.message ?? "Revisa los datos de tu perfil." };
  if (!c.data.nombre && !c.data.biografia && !c.data.usuario) return { ok: false, error: "Cuéntanos al menos tu nombre de perfil o tu biografía actual." };
  await ensure(userId);
  await db().update(profileOpt).set({ current: c.data }).where(eq(profileOpt.userId, userId));
  return { ok: true };
}

/** Genera las propuestas (o las rehace completas): conserva lo que el creador ya eligió. */
export async function generateProfile(userId: string): Promise<Result> {
  const row = await getProfile(userId);
  const current = row && parseCurrent(row.current);
  if (!row || !current) return { ok: false, error: "Primero cuéntanos cómo está tu perfil hoy." };
  const ctx = await context(userId, current);
  const r = await runPerfil(userId, ctx.raw, profileOutput, () => mockProfile(ctx));
  const out = normalize(r.output);
  await db().update(profileOpt).set({ result: out, extra: {}, votes: {}, refreshes: {}, mock: r.mock }).where(eq(profileOpt.userId, userId));
  return { ok: true };
}

/** Reglas de código: biografías ≤ 150 caracteres reales, destacadas ≤ 15 caracteres. */
function normalize(o: ProfileOut): ProfileOut {
  const bios = cleanBios(o.biografia.opciones);
  return {
    ...o,
    biografia: { ...o.biografia, opciones: bios.length ? bios : o.biografia.opciones.map((b) => ({ texto: [...b.texto].slice(0, BIO_MAX).join(""), caracteres: Math.min(BIO_MAX, [...b.texto].length) })) },
    nombre: { ...o.nombre, opciones: o.nombre.opciones.map((n) => [...n].slice(0, NAME_MAX).join("")) },
    destacadas: o.destacadas.map((d) => ({ ...d, nombre: cleanHighlightName(d.nombre) })).filter((d) => d.nombre),
  };
}

/** “Ninguna me convence” + nota: 5 nuevas opciones de nombre o biografía, sin borrar las anteriores (máx. 2 veces). */
export async function refreshPart(userId: string, part: "nombre" | "biografia", nota: string): Promise<Result> {
  const row = await getProfile(userId);
  const current = row && parseCurrent(row.current);
  const result = row && parseResult(row.result);
  if (!row || !current || !result) return { ok: false, error: "Primero genera tus propuestas." };
  const refreshes = refreshesOf(row.refreshes);
  if ((refreshes[part] ?? 0) >= MAX_REFRESH) return { ok: false, error: "Ya pediste otras opciones dos veces. Escribe la tuya." };
  if (nota.trim().length < 3) return { ok: false, error: "Cuéntanos qué no te convenció." };
  const extra = parseExtra(row.extra);
  const shown = [...(part === "nombre" ? result.nombre.opciones : result.biografia.opciones.map((b) => b.texto)), ...(extra[part] ?? []).flatMap((x) => x.options)];
  const ctx = await context(userId, current);
  const r = await runPerfil(userId, { ...ctx.raw, refresh: { parte: part, nota: nota.slice(0, 300), ya_mostradas: shown } }, profileOutput, () => mockProfile(ctx, { parte: part, nota }));
  const out = normalize(r.output);
  const options = (part === "nombre" ? out.nombre.opciones : out.biografia.opciones.map((b) => b.texto)).filter((o) => !shown.includes(o));
  if (!options.length) return { ok: false, error: "No salieron opciones nuevas. Intenta con otra nota." };
  await db()
    .update(profileOpt)
    .set({ extra: { ...extra, [part]: [...(extra[part] ?? []), { options, note: nota.slice(0, 300) }] }, refreshes: { ...refreshes, [part]: (refreshes[part] ?? 0) + 1 } })
    .where(eq(profileOpt.userId, userId));
  return { ok: true };
}

/** El creador elige una opción o escribe la suya. Se acepta tal cual; solo se avisa si el nombre no lleva palabra clave. */
export async function choosePart(userId: string, part: "nombre" | "biografia", text: string, edited: boolean): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  const row = await getProfile(userId);
  const result = row && parseResult(row.result);
  if (!row || !result) return { ok: false, error: "Primero genera tus propuestas." };
  const t = text.trim();
  if (!t) return { ok: false, error: "Escribe o elige un texto." };
  if (part === "biografia" && [...t].length > BIO_MAX) return { ok: false, error: `La biografía puede tener máximo ${BIO_MAX} caracteres (llevas ${[...t].length}).` };
  if (part === "nombre" && [...t].length > NAME_MAX) return { ok: false, error: `El nombre puede tener máximo ${NAME_MAX} caracteres.` };
  const before = parseChosen(row.chosen)[part] ?? "";
  const votes = parseVotes(row.votes);
  const vote: PartVote = { voto: edited ? "editado" : "si", ...(edited ? { antes: before, despues: t.slice(0, 400) } : {}) };
  await db().update(profileOpt).set({ chosen: { ...parseChosen(row.chosen), [part]: t }, votes: { ...votes, [part]: vote } }).where(eq(profileOpt.userId, userId));
  const keywords = [result.nombre.palabra_clave, ...(parseCurrent(row.current)?.nombre.split(/\W+/) ?? [])].filter(Boolean);
  const warning = part === "nombre" && !nameHasKeyword(t, [result.nombre.palabra_clave].filter(Boolean)) && keywords.length ? `Tu nombre no lleva la palabra que la gente busca (“${result.nombre.palabra_clave}”). Puedes dejarlo así si lo prefieres.` : undefined;
  return { ok: true, warning };
}

export async function votePart(userId: string, part: ProfilePart, raw: unknown): Promise<Result> {
  const v = votePartSchema.safeParse(raw);
  const row = await getProfile(userId);
  if (!v.success || !row) return { ok: false, error: "No se pudo guardar tu calificación." };
  await db().update(profileOpt).set({ votes: { ...parseVotes(row.votes), [part]: v.data } }).where(eq(profileOpt.userId, userId));
  return { ok: true };
}

export async function toggleApplied(userId: string, part: ProfilePart): Promise<void> {
  const row = await getProfile(userId);
  if (!row) return;
  const applied = parseApplied(row.applied);
  await db().update(profileOpt).set({ applied: { ...applied, [part]: !applied[part] } }).where(eq(profileOpt.userId, userId));
}

/* ───────────── Foto de perfil (skill 5, Gemini con visión) ───────────── */

export async function scorePhoto(userId: string, raw: Buffer, declaredType: string): Promise<Result> {
  if (!storageConfigured()) return { ok: false, error: "El almacenamiento no está configurado." };
  const check = PHOTO_TYPES[declaredType as keyof typeof PHOTO_TYPES];
  if (!check || !check(raw)) return { ok: false, error: "La foto debe ser JPG, PNG o WebP." };
  if (raw.length > PHOTO_MAX_BYTES) return { ok: false, error: "La foto pesa demasiado (máximo 8 MB)." };
  let processed: { data: Buffer; contentType: string };
  try {
    processed = await normalizePhoto(raw);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const row = await ensure(userId);
  let score: PhotoScore;
  let mock = false;
  try {
    if (geminiConfigured()) {
      const [manual, kit] = await Promise.all([getManual(userId).catch(() => null), getKit(userId).catch(() => null)]);
      const skill = await readFile(path.join(process.cwd(), "skills", "calificador-foto", "v1", "skill.md"), "utf8");
      const ctx = JSON.stringify({ kit_visual: kit?.final ? { colores: kit.final.colores } : null, brujula: { tono: manual?.content.tono ?? null } });
      const text = await geminiGenerate([{ text: `${skill}\n\nEntrada: ${ctx}\nSe adjunta UNA foto. Devuelve solo el JSON de salida con un elemento en "fotos".` }, { inline: { mime: "image/jpeg", data: processed.data } }], { json: true, timeoutMs: 90_000 });
      score = photoOutput.parse(parseJson(text)).fotos[0]!;
      await db().insert(aiCalls).values({ userId, skill: "calificador-foto", skillVersion: "calificador-foto-v1", mock: false, status: "ok", costCents: 0 }).catch(() => undefined);
    } else {
      score = mockPhoto().fotos[0]!;
      mock = true;
      await db().insert(aiCalls).values({ userId, skill: "calificador-foto", skillVersion: "calificador-foto-v1", mock: true, status: "ok", costCents: 0 }).catch(() => undefined);
    }
  } catch (err) {
    await db().insert(aiCalls).values({ userId, skill: "calificador-foto", skillVersion: "calificador-foto-v1", mock: false, status: "error", costCents: 0 }).catch(() => undefined);
    console.error("[perfil] no se pudo calificar la foto", err instanceof Error ? err.message : err);
    return { ok: false, error: "No pudimos calificar la foto ahora. Intenta de nuevo en un momento." };
  }
  const key = `perfil/${userId}/${randomUUID()}.jpg`;
  await putObjectStream(key, Readable.from(processed.data), processed.contentType);
  const list = [...parsePhotos(row.photos), { key, at: new Date().toISOString(), result: score, mock }];
  const keep = list.slice(-(MAX_PHOTOS * 2));
  for (const old of list.slice(0, list.length - keep.length)) await deleteObject(old.key).catch(() => undefined);
  await db().update(profileOpt).set({ photos: keep }).where(eq(profileOpt.userId, userId));
  return { ok: true };
}

export async function removePhoto(userId: string, key: string): Promise<void> {
  const row = await getProfile(userId);
  if (!row) return;
  const list = parsePhotos(row.photos);
  if (!list.some((p) => p.key === key)) return;
  await db().update(profileOpt).set({ photos: list.filter((p) => p.key !== key) }).where(eq(profileOpt.userId, userId));
  await deleteObject(key).catch(() => undefined);
}

export async function readPhotoByIndex(userId: string, index: number) {
  const row = await getProfile(userId);
  const p = row ? parsePhotos(row.photos)[index] : null;
  return p ? getObject(p.key) : null;
}

/** La foto con mejor calificación entre las últimas (regla 5: con varias fotos se elige una ganadora). */
export function winner(photos: Stored[]): number | null {
  const last = photos.slice(-MAX_PHOTOS);
  if (last.length < 2) return null;
  let best = 0;
  last.forEach((p, i) => {
    if (p.result.calificacion > last[best]!.result.calificacion) best = i;
  });
  return photos.length - last.length + best;
}
