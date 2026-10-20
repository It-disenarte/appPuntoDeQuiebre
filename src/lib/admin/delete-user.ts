import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { analyzedVideos, carousels, kitPhotos, metricReports, profileOpt, recordings, subscriptions, users, looseClips, videoEdits, videoExports } from "@/lib/db/schema";
import { deleteObject, storageConfigured } from "@/lib/storage";

/** Suscripciones que todavía cobran o pueden cobrar: no se puede borrar a alguien con una de estas (primero se cancela en Stripe). */
const LIVE = ["active", "trialing", "past_due", "unpaid", "incomplete"];

export type DeleteResult = { ok: true; email: string; name: string; files: number } | { ok: false; error: string };

/** Todas las llaves de archivos (MinIO) que pertenecen a un usuario. */
export async function collectFileKeys(userId: string): Promise<string[]> {
  const d = db();
  const [recs, exps, kit, metrics, cars, prof, thumbs, edits, clips] = await Promise.all([
    d.select({ k: recordings.objectKey }).from(recordings).where(eq(recordings.userId, userId)),
    d.select({ k: videoExports.objectKey }).from(videoExports).where(eq(videoExports.userId, userId)),
    d.select({ k: kitPhotos.storageKey }).from(kitPhotos).where(eq(kitPhotos.userId, userId)),
    d.select({ keys: metricReports.shotKeys }).from(metricReports).where(eq(metricReports.userId, userId)),
    d.select({ images: carousels.images }).from(carousels).where(eq(carousels.userId, userId)),
    d.select({ photos: profileOpt.photos }).from(profileOpt).where(eq(profileOpt.userId, userId)),
    d.select({ k: analyzedVideos.thumbnailKey }).from(analyzedVideos).where(eq(analyzedVideos.userId, userId)),
    d.select({ o: videoEdits.outputKey, c: videoEdits.coverKey }).from(videoEdits).where(eq(videoEdits.userId, userId)),
    d.select({ k: looseClips.objectKey }).from(looseClips).where(eq(looseClips.userId, userId)),
  ]);
  const keys = new Set<string>();
  const add = (k: unknown) => typeof k === "string" && k && keys.add(k);
  recs.forEach((r) => add(r.k));
  exps.forEach((r) => add(r.k));
  kit.forEach((r) => add(r.k));
  thumbs.forEach((r) => add(r.k));
  edits.forEach((r) => (add(r.o), add(r.c)));
  clips.forEach((r) => add(r.k));
  metrics.forEach((r) => (Array.isArray(r.keys) ? r.keys : []).forEach(add));
  cars.forEach((r) => Object.values((r.images && typeof r.images === "object" ? r.images : {}) as Record<string, { key?: string }>).forEach((i) => add(i?.key)));
  prof.forEach((r) => (Array.isArray(r.photos) ? r.photos : []).forEach((p) => add((p as { key?: string })?.key)));
  return [...keys];
}

/**
 * Elimina por completo a un creador con la cuenta DESACTIVADA: sus datos en la base (en cascada) y sus archivos.
 * Reglas: solo cuentas desactivadas, nunca administradores, y sin suscripción viva. Los pagos y facturas de la base se
 * borran con él (en Stripe se conservan). La bitácora de auditoría se queda, sin el vínculo al usuario.
 */
export async function deleteDisabledUser(userId: string, confirmEmail: string): Promise<DeleteResult> {
  const [u] = await db().select({ id: users.id, email: users.email, name: users.name, role: users.role, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return { ok: false, error: "Usuario no encontrado." };
  if (u.role !== "creator") return { ok: false, error: "No se puede eliminar a un administrador desde aquí." };
  if (u.status !== "disabled") return { ok: false, error: "Primero desactiva la cuenta." };
  if (confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()) return { ok: false, error: "El correo de confirmación no coincide." };
  const [sub] = await db().select({ status: subscriptions.status }).from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (sub && LIVE.includes(sub.status)) return { ok: false, error: "Su suscripción sigue viva en Stripe. Cancélala allá primero (Ver en Stripe) y vuelve a intentar." };

  const keys = await collectFileKeys(userId);
  await db().delete(users).where(eq(users.id, userId));
  if (storageConfigured()) for (const k of keys) await deleteObject(k).catch(() => undefined);
  return { ok: true, email: u.email, name: u.name, files: keys.length };
}
