import "server-only";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { and, count, desc, eq, gte, ne } from "drizzle-orm";
import { unzipSync } from "fflate";
import { getLimits } from "@/lib/admin/limits";
import { getSubscription } from "@/lib/billing/service";
import { db } from "@/lib/db";
import { carouselVideos } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs";
import { getKit } from "@/lib/kit/service";
import { sendToUser } from "@/lib/push";
import { runFfmpeg } from "@/lib/recording/ffmpeg";
import { deleteObject, getObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { animateArgs, isPng, MAX_FRAME_BYTES, MAX_SLIDES, MIN_SLIDES, slideSeconds, slideTexts, totalSeconds } from "./animate";
import { canvasKitOf } from "./kit";
import { getCarousel, parseContent } from "./service";

type Result = { ok: true } | { ok: false; error: string };

const monthStart = (now = new Date()) => {
  const [y, m] = now.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }).split("-");
  return new Date(`${y}-${m}-01T06:00:00Z`);
};

/** El video animado es del plan Pro, con un cupo mensual que cambia el admin (Límites y costos). */
export async function animationQuota(userId: string): Promise<{ allowed: boolean; used: number; limit: number; left: number }> {
  const [sub, limits] = await Promise.all([getSubscription(userId), getLimits()]);
  const [{ n }] = await db().select({ n: count() }).from(carouselVideos).where(and(eq(carouselVideos.userId, userId), ne(carouselVideos.status, "error"), gte(carouselVideos.createdAt, monthStart())));
  const used = n ?? 0;
  const limit = limits.carouselVideosMonthlyPro;
  return { allowed: sub?.plan === "pro" && limit > 0, used, limit, left: Math.max(0, limit - used) };
}

export type CarouselVideo = typeof carouselVideos.$inferSelect;

export async function getAnimation(userId: string, carouselId: string): Promise<CarouselVideo | null> {
  const [r] = await db().select().from(carouselVideos).where(and(eq(carouselVideos.userId, userId), eq(carouselVideos.carouselId, carouselId))).limit(1);
  return r ?? null;
}

/** Hay un video en marcha (y no es uno que se quedó atascado hace mucho). */
export const isAnimating = (v: CarouselVideo | null) => Boolean(v && (v.status === "pendiente" || v.status === "renderizando") && Date.now() - v.updatedAt.getTime() < 20 * 60 * 1000);

/**
 * El navegador ya mandó los PNG (un ZIP guardado en `framesKey`): se anota el pedido y se encola el trabajo.
 * Las validaciones de contenido (que sí sean PNG, cuántos slides) se repiten en el worker, donde se abre el ZIP.
 */
export async function requestAnimation(userId: string, carouselId: string, framesKey: string): Promise<Result> {
  const q = await animationQuota(userId);
  if (!q.allowed) return { ok: false, error: "El carrusel animado es del plan Pro." };
  const row = await getCarousel(userId, carouselId);
  const content = row && parseContent(row.content);
  if (!row || !content) return { ok: false, error: "Ese carrusel no existe o todavía no está listo." };
  const current = await getAnimation(userId, carouselId);
  if (isAnimating(current)) return { ok: false, error: "Ya estamos armando el video de este carrusel. Espera a que termine." };
  // Rehacer el video del mismo carrusel no gasta otro cupo del mes; el primero de cada carrusel, sí.
  if (!current && q.left <= 0) return { ok: false, error: `Ya usaste tus ${q.limit} videos animados de este mes.` };

  for (const k of [current?.framesKey, current?.outputKey]) if (k) await deleteObject(k).catch(() => undefined);
  const values = { status: "pendiente" as const, framesKey, outputKey: null, seconds: null, bytes: null, error: null };
  if (current) await db().update(carouselVideos).set(values).where(eq(carouselVideos.id, current.id));
  else await db().insert(carouselVideos).values({ userId, carouselId, ...values });
  await enqueue("carrusel.animar", userId, { carouselId }, { maxAttempts: 1 });
  return { ok: true };
}

/** Corre en el worker: abre los PNG, arma el video con ffmpeg y lo guarda. */
export async function runAnimation(userId: string, carouselId: string): Promise<void> {
  const v = await getAnimation(userId, carouselId);
  if (!v?.framesKey) return;
  const dir = await mkdtemp(path.join(tmpdir(), "pdq-carrusel-"));
  const fail = async (message: string) => {
    await db().update(carouselVideos).set({ status: "error", error: message.slice(0, 300) }).where(eq(carouselVideos.id, v.id));
  };
  try {
    await db().update(carouselVideos).set({ status: "renderizando", error: null }).where(eq(carouselVideos.id, v.id));
    const row = await getCarousel(userId, carouselId);
    const content = row && parseContent(row.content);
    if (!content) throw new Error("El carrusel ya no existe");

    const obj = await getObject(v.framesKey);
    if (!obj) throw new Error("No se encontraron las imágenes del carrusel");
    const zip = Buffer.from(await new Response(obj.body).arrayBuffer());
    const files = unzipSync(new Uint8Array(zip));
    const names = Object.keys(files).filter((n) => /\.png$/i.test(n) && !n.includes("/") && !n.includes("..")).sort();
    if (names.length < MIN_SLIDES || names.length > MAX_SLIDES) throw new Error(`Se esperaban de ${MIN_SLIDES} a ${MAX_SLIDES} imágenes y llegaron ${names.length}`);

    const frames: string[] = [];
    for (const [i, name] of names.entries()) {
      const bytes = files[name]!;
      if (bytes.length > MAX_FRAME_BYTES || !isPng(bytes)) throw new Error("Una de las imágenes no es válida");
      const f = path.join(dir, `slide-${String(i + 1).padStart(2, "0")}.png`);
      await writeFile(f, bytes);
      frames.push(f);
    }
    const seconds = frames.map((_, i) => slideSeconds(slideTexts(content.slides[i] ?? {}), i, frames.length));
    const kit = canvasKitOf((await getKit(userId)).final);
    const out = path.join(dir, "carrusel.mp4");
    await runFfmpeg(animateArgs({ frames, seconds, background: kit.principal, output: out }), 10 * 60 * 1000);

    const outKey = `carruseles/${userId}/${carouselId}/animado-${randomUUID()}.mp4`;
    await putObjectStream(outKey, createReadStream(out), "video/mp4");
    const { size } = await stat(out);
    await db().update(carouselVideos).set({ status: "lista", outputKey: outKey, framesKey: null, seconds: Math.round(totalSeconds(seconds)), bytes: size, error: null }).where(eq(carouselVideos.id, v.id));
    await deleteObject(v.framesKey).catch(() => undefined);
    void sendToUser(userId, { title: "Tu carrusel animado está listo", body: "Ya puedes verlo y descargarlo.", url: `/carruseles/${carouselId}`, tag: `carrusel-animado-${carouselId}` }).catch(() => undefined);
  } catch (err) {
    await fail(err instanceof Error ? err.message : "No se pudo armar el video");
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** El video armado, para verlo o descargarlo (solo su dueña). */
export async function openAnimation(userId: string, carouselId: string, range?: string) {
  const v = await getAnimation(userId, carouselId);
  if (!v || v.status !== "lista" || !v.outputKey || !storageConfigured()) return null;
  return getObject(v.outputKey, range);
}

/** Guarda en MinIO el ZIP que llegó del navegador y devuelve su llave. */
export async function storeFrames(userId: string, carouselId: string, body: Readable): Promise<string> {
  const key = `carruseles/${userId}/${carouselId}/frames-${randomUUID()}.zip`;
  await putObjectStream(key, body, "application/zip");
  return key;
}

/** Borra los archivos del video de un carrusel (al borrar el carrusel). */
export async function deleteAnimationFiles(userId: string, carouselId: string): Promise<void> {
  const v = await getAnimation(userId, carouselId);
  for (const k of [v?.framesKey, v?.outputKey]) if (k) await deleteObject(k).catch(() => undefined);
}

/** El último video armado de cada carrusel del creador (para mostrar el estado en la lista). */
export async function listAnimations(userId: string) {
  return db().select().from(carouselVideos).where(eq(carouselVideos.userId, userId)).orderBy(desc(carouselVideos.createdAt));
}
