import "server-only";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { and, count, eq, gte, ne } from "drizzle-orm";
import { unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { getLimits } from "@/lib/admin/limits";
import { getSubscription } from "@/lib/billing/service";
import { db } from "@/lib/db";
import { carouselVideos } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs";
import { sendToUser } from "@/lib/push";
import { runFfmpeg } from "@/lib/recording/ffmpeg";
import { deleteObject, getObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { BOXES_FILE, clipArgs, groupLayers, isPng, MAX_FRAME_BYTES, MAX_SLIDES, MIN_SLIDES, parseBoxes, PIECE_LAYERS, zipEntryFilter, type Boxes, type Layer } from "./animate";
import { planAnimations, previewOf, type SlideInfo } from "./animate-plan";
import { getCarousel, parseContent, parseImages } from "./service";

type Result = { ok: true } | { ok: false; error: string };

const monthStart = (now = new Date()) => {
  const [y, m] = now.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }).split("-");
  return new Date(`${y}-${m}-01T06:00:00Z`);
};

/** El carrusel animado es del plan Pro, con un cupo mensual que cambia el admin (Límites y costos). */
export async function animationQuota(userId: string): Promise<{ allowed: boolean; used: number; limit: number; left: number }> {
  const [sub, limits] = await Promise.all([getSubscription(userId), getLimits()]);
  const [{ n }] = await db().select({ n: count() }).from(carouselVideos).where(and(eq(carouselVideos.userId, userId), ne(carouselVideos.status, "error"), gte(carouselVideos.createdAt, monthStart())));
  const used = n ?? 0;
  const limit = limits.carouselVideosMonthlyPro;
  return { allowed: sub?.plan === "pro" && limit > 0, used, limit, left: Math.max(0, limit - used) };
}

export type CarouselVideo = typeof carouselVideos.$inferSelect;
const clipsSchema = z.array(z.object({ n: z.number().int(), key: z.string(), seconds: z.number(), bytes: z.number() }));
export type Clip = z.infer<typeof clipsSchema>[number];
export const parseClips = (raw: unknown): Clip[] => {
  const r = clipsSchema.safeParse(raw);
  return r.success ? r.data : [];
};

/** Lo que decidió animar la IA, para mostrárselo a la creadora: { hilo_comun, ai, slides: [{ n, porque }] }. */
const planSchema = z.object({ hilo_comun: z.string().default(""), ai: z.boolean().default(false), slides: z.array(z.object({ n: z.number().int(), porque: z.string().default("") })).default([]) });
export type StoredPlan = z.infer<typeof planSchema>;
export const parsePlan = (raw: unknown): StoredPlan | null => {
  const r = planSchema.safeParse(raw);
  return r.success ? r.data : null;
};

export async function getAnimation(userId: string, carouselId: string): Promise<CarouselVideo | null> {
  const [r] = await db().select().from(carouselVideos).where(and(eq(carouselVideos.userId, userId), eq(carouselVideos.carouselId, carouselId))).limit(1);
  return r ?? null;
}

/** Hay clips en marcha (y no es un trabajo que se quedó atascado hace mucho). */
export const isAnimating = (v: CarouselVideo | null) => Boolean(v && (v.status === "pendiente" || v.status === "renderizando") && Date.now() - v.updatedAt.getTime() < 25 * 60 * 1000);

/** Todos los archivos de video de un carrusel (los clips y el ZIP de capas pendiente), para borrarlos. */
export const filesOf = (v: CarouselVideo | null): string[] => [v?.framesKey, v?.outputKey, ...parseClips(v?.clips).map((c) => c.key)].filter((k): k is string => Boolean(k));

/**
 * El navegador ya mandó las capas de los slides (un ZIP guardado en `framesKey`): se anota el pedido y se encola el trabajo.
 * Las validaciones de contenido (que sí sean PNG, cuántos slides) se repiten en el worker, donde se abre el ZIP.
 */
export async function requestAnimation(userId: string, carouselId: string, framesKey: string): Promise<Result> {
  const q = await animationQuota(userId);
  if (!q.allowed) return { ok: false, error: "El carrusel animado es del plan Pro." };
  const row = await getCarousel(userId, carouselId);
  const content = row && parseContent(row.content);
  if (!row || !content) return { ok: false, error: "Ese carrusel no existe o todavía no está listo." };
  const current = await getAnimation(userId, carouselId);
  if (isAnimating(current)) return { ok: false, error: "Ya estamos animando este carrusel. Espera a que termine." };
  // Rehacer la animación del mismo carrusel no gasta otro cupo del mes; la primera de cada carrusel, sí.
  if (!current && q.left <= 0) return { ok: false, error: `Ya usaste tus ${q.limit} videos animados de este mes.` };

  for (const k of filesOf(current)) await deleteObject(k).catch(() => undefined);
  const values = { status: "pendiente" as const, framesKey, outputKey: null, clips: null, plan: null, seconds: null, bytes: null, error: null };
  if (current) await db().update(carouselVideos).set(values).where(eq(carouselVideos.id, current.id));
  else {
    try {
      await db().insert(carouselVideos).values({ userId, carouselId, ...values });
    } catch (e) {
      // Doble toque: la otra petición ganó la carrera (hay un índice único por carrusel).
      if ((e as { code?: string }).code === "23505" || /duplicate key|unique/i.test(e instanceof Error ? e.message : "")) return { ok: false, error: "Ya estamos animando este carrusel. Espera a que termine." };
      throw e;
    }
  }
  await enqueue("carrusel.animar", userId, { carouselId }, { maxAttempts: 1 });
  return { ok: true };
}

/** Corre en el worker: abre las capas, anima cada slide con ffmpeg y guarda los clips. */
export async function runAnimation(userId: string, carouselId: string): Promise<void> {
  const v = await getAnimation(userId, carouselId);
  if (!v?.framesKey) return;
  const dir = await mkdtemp(path.join(tmpdir(), "pdq-carrusel-"));
  const uploaded: string[] = [];
  try {
    await db().update(carouselVideos).set({ status: "renderizando", error: null }).where(eq(carouselVideos.id, v.id));
    const row = await getCarousel(userId, carouselId);
    const content = row && parseContent(row.content);
    if (!content) throw new Error("El carrusel ya no existe");

    const obj = await getObject(v.framesKey);
    if (!obj) throw new Error("No se encontraron las imágenes del carrusel");
    const zip = Buffer.from(await new Response(obj.body).arrayBuffer());
    const unzipped = unzipSync(new Uint8Array(zip), { filter: zipEntryFilter() });
    const groups = groupLayers(unzipped);
    const slides = [...groups.entries()].sort((a, b) => a[0] - b[0]);
    if (slides.length < MIN_SLIDES || slides.length > MAX_SLIDES) throw new Error(`Se esperaban de ${MIN_SLIDES} a ${MAX_SLIDES} slides y llegaron ${slides.length}`);
    for (const [n, layers] of slides) {
      if (!layers.fondo) throw new Error(`Al slide ${n} le falta su fondo`);
      for (const bytes of Object.values(layers)) if (bytes.length > MAX_FRAME_BYTES || !isPng(bytes)) throw new Error("Una de las imágenes no es válida");
      if (n < 1 || n > content.slides.length) throw new Error(`El slide ${n} no existe en este carrusel`);
    }

    // Dónde está cada pieza (lo manda el navegador; si no llega, las piezas se animan sin zoom ni pulso).
    let boxes = new Map<number, Boxes>();
    try {
      const raw = unzipped[BOXES_FILE];
      if (raw && raw.length < 200_000) boxes = parseBoxes(JSON.parse(Buffer.from(raw).toString("utf8")));
    } catch {
      /* sin cajas */
    }
    const images = parseImages(row.images);
    const infos: SlideInfo[] = slides.map(([n, layers]) => ({
      n,
      present: Object.fromEntries(PIECE_LAYERS.map((l) => [l, Boolean(layers[l])])),
      boxes: boxes.get(n) ?? {},
      hasPhoto: Boolean(images[String(n)]),
    }));

    // La IA mira los slides y decide qué animar y cómo (si no puede, se usa el plan de siempre).
    const previews = await Promise.all(slides.map(([, layers]) => previewOf(layers)));
    const planned = await planAnimations(userId, content, infos, previews);

    const clips: Clip[] = [];
    let total = 0;
    for (const [n, layers] of slides) {
      const files: Partial<Record<Layer, string>> = {};
      for (const [layer, bytes] of Object.entries(layers) as [Layer, Uint8Array][]) {
        files[layer] = path.join(dir, `${String(n).padStart(2, "0")}-${layer}.png`);
        await writeFile(files[layer]!, bytes);
      }
      const plan = planned.plans.get(n)!;
      const out = path.join(dir, `clip-${String(n).padStart(2, "0")}.mp4`);
      await runFfmpeg(clipArgs({ layers: files, boxes: boxes.get(n), plan, output: out }), 5 * 60 * 1000);
      const key = `carruseles/${userId}/${carouselId}/clip-${String(n).padStart(2, "0")}-${randomUUID()}.mp4`;
      await putObjectStream(key, createReadStream(out), "video/mp4");
      uploaded.push(key);
      const { size } = await stat(out);
      clips.push({ n, key, seconds: plan.duracion_s, bytes: size });
      total += plan.duracion_s;
    }
    const stored: StoredPlan = { hilo_comun: planned.hiloComun, ai: planned.ai, slides: slides.map(([n]) => ({ n, porque: planned.plans.get(n)?.porque ?? "" })) };
    await db().update(carouselVideos).set({ status: "lista", clips, plan: stored, framesKey: null, seconds: Math.round(total), bytes: clips.reduce((s, c) => s + c.bytes, 0), error: null }).where(eq(carouselVideos.id, v.id));
    await deleteObject(v.framesKey).catch(() => undefined);
    void sendToUser(userId, { title: "Tu carrusel animado está listo", body: "Ya puedes verlo y descargarlo.", url: `/carruseles/${carouselId}`, tag: `carrusel-animado-${carouselId}` }).catch(() => undefined);
  } catch (err) {
    for (const k of uploaded) await deleteObject(k).catch(() => undefined);
    await db().update(carouselVideos).set({ status: "error", error: (err instanceof Error ? err.message : "No se pudo animar el carrusel").slice(0, 300) }).where(eq(carouselVideos.id, v.id));
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Un clip animado, para verlo o descargarlo (solo su dueña). */
export async function openClip(userId: string, carouselId: string, n: number, range?: string) {
  const v = await getAnimation(userId, carouselId);
  const clip = v?.status === "lista" ? parseClips(v.clips).find((c) => c.n === n) : null;
  if (!clip || !storageConfigured()) return null;
  return getObject(clip.key, range);
}

/** Todos los clips en un ZIP (sin comprimir: los MP4 ya están comprimidos). */
export async function zipClips(userId: string, carouselId: string): Promise<Uint8Array | null> {
  const v = await getAnimation(userId, carouselId);
  const clips = v?.status === "lista" ? parseClips(v.clips) : [];
  if (clips.length === 0 || !storageConfigured()) return null;
  const files: Record<string, Uint8Array> = {};
  for (const c of [...clips].sort((a, b) => a.n - b.n)) {
    const obj = await getObject(c.key);
    if (!obj) return null;
    files[`${String(c.n).padStart(2, "0")}_slide.mp4`] = new Uint8Array(await new Response(obj.body).arrayBuffer());
  }
  return zipSync(files, { level: 0 });
}

/** Guarda en MinIO el ZIP de capas que llegó del navegador y devuelve su llave. */
export async function storeFrames(userId: string, carouselId: string, body: Readable): Promise<string> {
  const key = `carruseles/${userId}/${carouselId}/capas-${randomUUID()}.zip`;
  await putObjectStream(key, body, "application/zip");
  return key;
}

/** Borra los archivos de la animación de un carrusel (al borrar el carrusel). */
export async function deleteAnimationFiles(userId: string, carouselId: string): Promise<void> {
  for (const k of filesOf(await getAnimation(userId, carouselId))) await deleteObject(k).catch(() => undefined);
}
