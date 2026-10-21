import "server-only";
import { createWriteStream } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { and, asc, count, eq } from "drizzle-orm";
import { claudeConfigured } from "@/lib/ai/claude";
import { getManual, getVoiceProfile } from "@/lib/brujula/service";
import { db } from "@/lib/db";
import { aiCalls, capcutRecipes, looseClips } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs";
import { getPiece, parseScript } from "@/lib/plan/service";
import { sendToUser } from "@/lib/push";
import { meanVolume, probeVideo, runFfmpeg } from "@/lib/recording/ffmpeg";
import { visionJson } from "@/lib/skills";
import type { VideoGuion } from "@/lib/skills/schemas";
import { deleteObject, getObject } from "@/lib/storage";
import { frameArgs } from "./render-args";
import { MAX_CLIPS, mockRecipe, recipeSchema, shapeRecipe, type Recipe, type RecipeClip } from "./recipe-schemas";
import { MAX_ADJUSTMENTS } from "./schemas";
import { VO_MAX_TOTAL_BYTES } from "./vo-rules";
import { assKitOf, editQuota } from "./service";

export type Clip = typeof looseClips.$inferSelect;
type RecipeRow = typeof capcutRecipes.$inferSelect;
type Result = { ok: true } | { ok: false; error: string };

export const listClips = (userId: string, pieceId: string): Promise<Clip[]> => db().select().from(looseClips).where(and(eq(looseClips.userId, userId), eq(looseClips.pieceId, pieceId))).orderBy(asc(looseClips.position));
export const getRecipe = async (userId: string, pieceId: string): Promise<RecipeRow | null> => {
  const [r] = await db().select().from(capcutRecipes).where(and(eq(capcutRecipes.userId, userId), eq(capcutRecipes.pieceId, pieceId))).limit(1);
  return r ?? null;
};
export const parseRecipe = (raw: unknown): Recipe | null => {
  const r = recipeSchema.safeParse(raw);
  return r.success ? r.data : null;
};
export const isRecipeStuck = (r: RecipeRow, now = Date.now()) => r.status === "procesando" && now - r.updatedAt.getTime() > 25 * 60 * 1000;

/* ───────────── Tomas sueltas ───────────── */

export async function canAddClip(userId: string, pieceId: string): Promise<Result> {
  const piece = await getPiece(userId, pieceId);
  if (!piece || piece.kind !== "video") return { ok: false, error: "Esa pieza no existe." };
  const q = await editQuota(userId);
  if (!q.allowed) return { ok: false, error: "La edición es del plan Pro." };
  const [{ n }] = await db().select({ n: count() }).from(looseClips).where(eq(looseClips.pieceId, pieceId));
  if ((n ?? 0) >= MAX_CLIPS) return { ok: false, error: `Máximo ${MAX_CLIPS} tomas.` };
  if ((await (await import("./voiceover")).clipsBytes(pieceId)) >= VO_MAX_TOTAL_BYTES) return { ok: false, error: "Tus tomas ya pesan 1 GB en total. Quita alguna para subir más." };
  return { ok: true };
}

export async function commitClip(v: { userId: string; pieceId: string; key: string; contentType: string; bytes: number; seconds: number }): Promise<Clip> {
  const [{ n }] = await db().select({ n: count() }).from(looseClips).where(eq(looseClips.pieceId, v.pieceId));
  const [row] = await db().insert(looseClips).values({ userId: v.userId, pieceId: v.pieceId, objectKey: v.key, contentType: v.contentType, bytes: v.bytes, seconds: v.seconds, position: n ?? 0 }).returning();
  return row!;
}

export async function removeClip(userId: string, id: string): Promise<void> {
  const [c] = await db().select().from(looseClips).where(and(eq(looseClips.id, id), eq(looseClips.userId, userId))).limit(1);
  if (!c) return;
  await db().delete(looseClips).where(eq(looseClips.id, id));
  await deleteObject(c.objectKey).catch(() => undefined);
  const rest = await listClips(userId, c.pieceId);
  for (const [i, r] of rest.entries()) if (r.position !== i) await db().update(looseClips).set({ position: i }).where(eq(looseClips.id, r.id));
}

export async function moveClip(userId: string, id: string, dir: "up" | "down"): Promise<void> {
  const [c] = await db().select().from(looseClips).where(and(eq(looseClips.id, id), eq(looseClips.userId, userId))).limit(1);
  if (!c) return;
  const list = await listClips(userId, c.pieceId);
  const i = list.findIndex((x) => x.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  await db().update(looseClips).set({ position: list[j]!.position }).where(eq(looseClips.id, list[i]!.id));
  await db().update(looseClips).set({ position: list[i]!.position }).where(eq(looseClips.id, list[j]!.id));
}

export async function openClip(userId: string, id: string, range?: string) {
  const [c] = await db().select().from(looseClips).where(and(eq(looseClips.id, id), eq(looseClips.userId, userId))).limit(1);
  return c ? getObject(c.objectKey, range) : null;
}

/* ───────────── Receta ───────────── */

export async function requestRecipe(userId: string, pieceId: string): Promise<Result> {
  const q = await editQuota(userId);
  if (!q.allowed) return { ok: false, error: "La edición es del plan Pro." };
  const piece = await getPiece(userId, pieceId);
  if (!piece || piece.kind !== "video") return { ok: false, error: "Esa pieza no existe." };
  if ((await listClips(userId, pieceId)).length === 0) return { ok: false, error: "Sube al menos una toma." };
  const cur = await getRecipe(userId, pieceId);
  if (cur?.status === "procesando" && !isRecipeStuck(cur)) return { ok: false, error: "Ya estamos armando tu receta." };
  if (cur) await db().update(capcutRecipes).set({ status: "procesando", error: null, adjustments: 0, adjustNote: null }).where(eq(capcutRecipes.id, cur.id));
  else await db().insert(capcutRecipes).values({ userId, pieceId });
  const row = (await getRecipe(userId, pieceId))!;
  await enqueue("edicion.receta", userId, { recipeId: row.id });
  return { ok: true };
}

export async function requestRecipeAdjust(userId: string, pieceId: string, nota: string): Promise<Result> {
  const r = await getRecipe(userId, pieceId);
  if (!r || r.status !== "lista") return { ok: false, error: "Esta receta no se puede ajustar ahora." };
  if (r.adjustments >= MAX_ADJUSTMENTS) return { ok: false, error: "Ya usaste los 3 ajustes." };
  if (nota.trim().length < 3) return { ok: false, error: "Cuéntanos qué quieres cambiar." };
  await db().update(capcutRecipes).set({ status: "procesando", adjustments: r.adjustments + 1, adjustNote: nota.trim().slice(0, 300), error: null }).where(eq(capcutRecipes.id, r.id));
  await enqueue("edicion.receta", userId, { recipeId: r.id });
  return { ok: true };
}

async function logCall(userId: string, mock: boolean, status: "ok" | "error", t?: { i?: number; o?: number }) {
  await db().insert(aiCalls).values({ userId, skill: "edicion-receta", skillVersion: "edicion-v1", mock, status, costCents: 0, inputTokens: t?.i ?? null, outputTokens: t?.o ?? null }).catch(() => undefined);
}

/** Baja cada toma, saca fotogramas y mide si trae voz; manda todo a Claude y guarda la receta. Corre en el worker. */
export async function runRecipe(userId: string, recipeId: string): Promise<void> {
  const [row] = await db().select().from(capcutRecipes).where(and(eq(capcutRecipes.id, recipeId), eq(capcutRecipes.userId, userId))).limit(1);
  if (!row) return;
  const piece = await getPiece(userId, row.pieceId);
  const parsed = piece ? parseScript("video", piece.script) : null;
  if (!piece) throw new Error("La pieza ya no existe");
  const script = (parsed && "cuerpo" in parsed ? parsed : null) as VideoGuion | null;
  const clips = await listClips(userId, row.pieceId);
  if (clips.length === 0) throw new Error("No hay tomas");
  await db().update(capcutRecipes).set({ status: "procesando", error: null }).where(eq(capcutRecipes.id, recipeId));

  const dir = await mkdtemp(path.join(tmpdir(), "pdq-recipe-"));
  try {
    const info: RecipeClip[] = [];
    const images: Buffer[] = [];
    const framesPer: { id: string; segundos: number[] }[] = [];
    for (const [i, c] of clips.entries()) {
      const id = `c${i + 1}`;
      const file = path.join(dir, `${id}.${c.contentType === "video/webm" ? "webm" : c.contentType === "video/quicktime" ? "mov" : "mp4"}`);
      const obj = await getObject(c.objectKey);
      if (!obj) throw new Error("No se encontró una de las tomas");
      await pipeline(Readable.fromWeb(obj.body as unknown as NodeWebStream), createWriteStream(file));
      const p = await probeVideo(file);
      const vol = await meanVolume(file).catch(() => null);
      info.push({ id, seconds: p.duration || c.seconds, hasVoice: vol !== null && vol > -38 });
      if (claudeConfigured()) {
        const pattern = path.join(dir, `${id}-%02d.jpg`);
        await runFfmpeg(frameArgs(file, pattern, 2, 8));
        const files = (await readdir(dir)).filter((f) => f.startsWith(`${id}-`) && f.endsWith(".jpg")).sort();
        framesPer.push({ id, segundos: files.map((_, k) => k * 2) });
        for (const f of files) images.push(await readFile(path.join(dir, f)));
      }
    }

    const ak = await assKitOf(userId);
    const [manual, voice] = await Promise.all([getManual(userId).catch(() => null), getVoiceProfile(userId).catch(() => null)]);
    const kit = { titleFont: ak.kit.titleFont, textColor: ak.kit.textColor, detailColor: ak.kit.detailColor };
    let recipe: Recipe;
    let mock = false;
    if (claudeConfigured()) {
      const skill = await readFile(path.join(process.cwd(), "skills", "edicion", "v1", "skill.md"), "utf8");
      const input = {
        creador_id: userId,
        plan: "pro",
        modo: "receta_capcut",
        video: { duracion_s: 0, red_destino: ["instagram"], formato: "reel" },
        pieza: { pilar: piece.pillar, tema: piece.topic, guion: script ? { gancho: script.gancho, desarrollo: script.cuerpo.join(" "), cierre_cta: script.cierre } : {} },
        transcripcion: { palabras: [] },
        clips: info.map((c) => ({ id: c.id, duracion_s: Math.round(c.seconds * 10) / 10, tiene_voz: c.hasVoice, fotogramas: (framesPer.find((f) => f.id === c.id)?.segundos ?? []).map((s) => ({ segundo: s, url: "imagen adjunta, en el mismo orden" })), transcripcion: null })),
        kit_visual: ak.raw ?? {},
        brujula: { tono: manual?.content.tono ?? null, palabras_si: manual?.content.palabras_si ?? [] },
        perfil_voz: { muletillas_propias: (voice?.content.muletillas ?? []).map((m) => m.texto) },
        coach: null,
        ajuste: { numero: row.adjustments, anterior: parseRecipe(row.result), nota: row.adjustNote },
      };
      const r = await visionJson(skill, `Entrada:\n${JSON.stringify(input)}\n\nLas imágenes adjuntas son los fotogramas de los clips, en el orden de la lista (c1, c2, …). Responde solo con el JSON de salida del modo receta_capcut.`, images, "edicion-receta");
      recipe = recipeSchema.parse(r.json);
      await logCall(userId, false, "ok", { i: r.inputTokens, o: r.outputTokens });
    } else {
      recipe = mockRecipe(info, { topic: piece.topic, hook: script?.gancho ?? "", cta: script?.cierre ?? "" });
      mock = true;
      await logCall(userId, true, "ok");
    }
    const shaped = shapeRecipe(recipe, info, kit);
    await db().update(capcutRecipes).set({ status: "lista", result: shaped, mock, error: null }).where(eq(capcutRecipes.id, recipeId));
    void sendToUser(userId, { title: "Tu receta de CapCut está lista", body: "Ya puedes seguir los pasos.", url: `/grabar?pieza=${row.pieceId}`, tag: `receta-${row.pieceId}` }).catch(() => undefined);
  } catch (err) {
    await logCall(userId, false, "error");
    await db().update(capcutRecipes).set({ status: "error", error: (err instanceof Error ? err.message : "No se pudo armar la receta").slice(0, 300) }).where(eq(capcutRecipes.id, recipeId));
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

