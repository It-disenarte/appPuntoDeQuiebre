import "server-only";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { videoExports } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs";
import { getPiece } from "@/lib/plan/service";
import { sendToUser } from "@/lib/push";
import { deleteObject, getObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { joinArgs, runFfmpeg } from "./ffmpeg";
import { PARTS, progress, type Part } from "./rules";
import { listRecordings } from "./service";

export type VideoExport = typeof videoExports.$inferSelect;
type Result = { ok: true } | { ok: false; error: string };

export async function getExport(userId: string, pieceId: string): Promise<VideoExport | null> {
  const [e] = await db().select().from(videoExports).where(and(eq(videoExports.userId, userId), eq(videoExports.pieceId, pieceId))).limit(1);
  return e ?? null;
}

/** El video armado quedó viejo si se regrabó alguna parte después de armarlo. */
export async function isOutdated(userId: string, pieceId: string, exp: VideoExport | null): Promise<boolean> {
  if (!exp || exp.status !== "lista") return false;
  const recs = await listRecordings(userId, pieceId);
  return recs.some((r) => r.updatedAt > exp.updatedAt);
}

export async function requestJoin(userId: string, pieceId: string): Promise<Result> {
  if (!storageConfigured()) return { ok: false, error: "El almacenamiento no está configurado." };
  const piece = await getPiece(userId, pieceId);
  if (!piece || piece.kind !== "video") return { ok: false, error: "Esa pieza no existe." };
  const recs = await listRecordings(userId, pieceId);
  if (!progress(recs.map((r) => r.part as Part)).complete) return { ok: false, error: "Primero sube las 3 partes de tu video." };
  const cur = await getExport(userId, pieceId);
  if (cur?.status === "procesando" && Date.now() - cur.updatedAt.getTime() < 20 * 60 * 1000) return { ok: false, error: "Ya estamos armando tu video." };
  if (cur) await db().update(videoExports).set({ status: "procesando", error: null }).where(eq(videoExports.id, cur.id));
  else await db().insert(videoExports).values({ userId, pieceId }).onConflictDoNothing();
  await enqueue("video.unir", userId, { pieceId });
  return { ok: true };
}

/** Descarga las partes, las une con ffmpeg y guarda el resultado en MinIO. Corre en el worker. */
export async function runJoin(userId: string, pieceId: string): Promise<void> {
  const exp = await getExport(userId, pieceId);
  if (!exp) return;
  const dir = await mkdtemp(path.join(tmpdir(), "pdq-join-"));
  try {
    const recs = (await listRecordings(userId, pieceId)).sort((a, b) => PARTS.indexOf(a.part as Part) - PARTS.indexOf(b.part as Part));
    if (recs.length === 0) throw new Error("No hay partes para unir");
    const files: string[] = [];
    for (const r of recs) {
      const obj = await getObject(r.objectKey);
      if (!obj) throw new Error("No se encontró una de las partes grabadas");
      const file = path.join(dir, `${r.part}.${r.contentType === "video/webm" ? "webm" : r.contentType === "video/quicktime" ? "mov" : "mp4"}`);
      await pipeline(Readable.fromWeb(obj.body as unknown as NodeWebStream), createWriteStream(file));
      files.push(file);
    }
    const out = path.join(dir, "completo.mp4");
    await runFfmpeg(joinArgs(files, out));
    const size = (await stat(out)).size;
    const key = `exportaciones/${userId}/${pieceId}/${randomUUID()}.mp4`;
    await putObjectStream(key, createReadStream(out), "video/mp4");
    if (exp.objectKey) await deleteObject(exp.objectKey).catch(() => undefined);
    await db().update(videoExports).set({ status: "lista", objectKey: key, bytes: size, seconds: recs.reduce((s, r) => s + r.seconds, 0), error: null }).where(eq(videoExports.id, exp.id));
    void sendToUser(userId, { title: "Tu video está listo", body: "Ya puedes descargarlo completo.", url: `/grabar?pieza=${pieceId}`, tag: `video-${pieceId}` }).catch(() => undefined);
  } catch (err) {
    await db().update(videoExports).set({ status: "error", error: (err instanceof Error ? err.message : "No se pudo armar el video").slice(0, 300) }).where(eq(videoExports.id, exp.id));
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function openExport(userId: string, pieceId: string, range?: string) {
  const exp = await getExport(userId, pieceId);
  if (!exp || exp.status !== "lista" || !exp.objectKey) return null;
  const obj = await getObject(exp.objectKey, range);
  return obj ? { obj, bytes: exp.bytes } : null;
}
