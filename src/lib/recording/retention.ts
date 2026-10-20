import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { recordings, videoEdits, videoExports } from "@/lib/db/schema";
import { deleteObject, storageConfigured } from "@/lib/storage";

/** Los videos (partes, video completo y videos editados) se conservan 30 días: luego se borran para no llenar el disco. */
export const RETENTION_DAYS = 30;
export const PURGED_MESSAGE = `Este video se borró por antigüedad (se conservan ${RETENTION_DAYS} días). Descárgalo siempre antes.`;

/** Borra los archivos de video con más de 30 días y deja anotado que se borraron. La pieza sigue marcada como grabada. */
export async function purgeOldVideos(now = new Date()): Promise<{ parts: number; exports: number; edits: number }> {
  if (!storageConfigured()) return { parts: 0, exports: 0, edits: 0 };
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  const d = db();
  let parts = 0;
  let exps = 0;
  let edits = 0;

  for (const r of await d.select().from(recordings).where(and(isNull(recordings.purgedAt), lt(recordings.updatedAt, cutoff)))) {
    await deleteObject(r.objectKey).catch(() => undefined);
    await d.update(recordings).set({ purgedAt: now }).where(eq(recordings.id, r.id));
    parts += 1;
  }
  for (const e of await d.select().from(videoExports).where(and(isNotNull(videoExports.objectKey), lt(videoExports.updatedAt, cutoff)))) {
    await deleteObject(e.objectKey!).catch(() => undefined);
    await d.update(videoExports).set({ objectKey: null, status: "error", error: PURGED_MESSAGE }).where(eq(videoExports.id, e.id));
    exps += 1;
  }
  for (const e of await d.select().from(videoEdits).where(and(inArray(videoEdits.status, ["lista"]), lt(videoEdits.updatedAt, cutoff)))) {
    for (const k of [e.outputKey, e.coverKey]) if (k) await deleteObject(k).catch(() => undefined);
    await d.update(videoEdits).set({ outputKey: null, coverKey: null, status: "error", error: PURGED_MESSAGE }).where(eq(videoEdits.id, e.id));
    edits += 1;
  }
  return { parts, exports: exps, edits };
}
