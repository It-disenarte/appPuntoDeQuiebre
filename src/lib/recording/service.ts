import "server-only";
import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentPieces, recordings } from "@/lib/db/schema";
import { todayIso } from "@/lib/plan/rules";
import { deleteObject, getObject } from "@/lib/storage";
import { progress, type Part } from "./rules";

export type Recording = typeof recordings.$inferSelect;

const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const listRecordings = (userId: string, pieceId: string): Promise<Recording[]> =>
  db().select().from(recordings).where(and(eq(recordings.userId, userId), eq(recordings.pieceId, pieceId)));

/** Cuántas de las 3 partes tiene grabadas cada pieza (para la lista de videos). */
export async function recordedCounts(userId: string, pieceIds: string[]): Promise<Map<string, number>> {
  if (pieceIds.length === 0) return new Map();
  const rows = await db()
    .select({ pieceId: recordings.pieceId, n: count() })
    .from(recordings)
    .where(and(eq(recordings.userId, userId), inArray(recordings.pieceId, pieceIds)))
    .groupBy(recordings.pieceId);
  return new Map(rows.map((r) => [r.pieceId, Number(r.n)]));
}

/** Videos de la parrilla por grabar: los de los últimos 14 días en adelante que no están publicados ni descartados. */
export function recordablePieces(userId: string, today = todayIso()) {
  return db()
    .select()
    .from(contentPieces)
    .where(and(eq(contentPieces.userId, userId), eq(contentPieces.kind, "video"), inArray(contentPieces.status, ["pendiente", "grabado"]), gte(contentPieces.day, addDaysIso(today, -14))))
    .orderBy(asc(contentPieces.day), asc(contentPieces.n));
}

/** Con las 3 partes la pieza pasa a "grabado"; si se borra una, vuelve a "pendiente". */
async function syncPieceStatus(userId: string, pieceId: string) {
  const done = (await listRecordings(userId, pieceId)).map((r) => r.part as Part);
  const complete = progress(done).complete;
  await db()
    .update(contentPieces)
    .set({ status: complete ? "grabado" : "pendiente" })
    .where(and(eq(contentPieces.id, pieceId), eq(contentPieces.userId, userId), eq(contentPieces.status, complete ? "pendiente" : "grabado")));
}

export async function ownsVideoPiece(userId: string, pieceId: string): Promise<boolean> {
  const [p] = await db().select({ id: contentPieces.id }).from(contentPieces).where(and(eq(contentPieces.id, pieceId), eq(contentPieces.userId, userId), eq(contentPieces.kind, "video"))).limit(1);
  return Boolean(p);
}

/** Registra la parte ya subida. Si había otra, la reemplaza y borra el archivo anterior. */
export async function commitRecording(v: { userId: string; pieceId: string; part: Part; key: string; contentType: string; bytes: number; seconds: number }): Promise<Recording> {
  const [old] = await db().select().from(recordings).where(and(eq(recordings.pieceId, v.pieceId), eq(recordings.part, v.part))).limit(1);
  const [row] = await db()
    .insert(recordings)
    .values({ userId: v.userId, pieceId: v.pieceId, part: v.part, objectKey: v.key, contentType: v.contentType, bytes: v.bytes, seconds: v.seconds })
    .onConflictDoUpdate({ target: [recordings.pieceId, recordings.part], set: { objectKey: v.key, contentType: v.contentType, bytes: v.bytes, seconds: v.seconds } })
    .returning();
  if (old && old.objectKey !== v.key) await deleteObject(old.objectKey).catch(() => undefined);
  await syncPieceStatus(v.userId, v.pieceId);
  return row!;
}

export async function removeRecording(userId: string, id: string): Promise<boolean> {
  const [r] = await db().select().from(recordings).where(and(eq(recordings.id, id), eq(recordings.userId, userId))).limit(1);
  if (!r) return false;
  await db().delete(recordings).where(eq(recordings.id, id));
  await deleteObject(r.objectKey).catch(() => undefined);
  await syncPieceStatus(userId, r.pieceId);
  return true;
}

export async function openRecording(userId: string, id: string, range?: string) {
  const [r] = await db().select().from(recordings).where(and(eq(recordings.id, id), eq(recordings.userId, userId))).limit(1);
  if (!r) return null;
  return getObject(r.objectKey, range);
}
