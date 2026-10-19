import "server-only";
import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { env } from "@/lib/env";

/**
 * Web Push propio (sin servicios de terceros). El servidor firma cada envío con las llaves VAPID y el servicio de push del
 * navegador (Google, Mozilla, Apple, Microsoft) lo entrega. Las suscripciones solo pueden apuntar a esos servicios:
 * si no, un usuario podría hacer que el servidor mande peticiones a direcciones internas.
 */
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)android\.googleapis\.com$/];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && u.port === "" && PUSH_HOSTS.some((r) => r.test(u.hostname)) && endpoint.length <= 600;
  } catch {
    return false;
  }
}

export const subscriptionSchema = z.object({
  endpoint: z.string().refine(isPushEndpoint, "Servicio de notificaciones no permitido"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

export function pushConfigured(): boolean {
  const e = env();
  return Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.VAPID_SUBJECT);
}

export async function saveSubscription(userId: string, sub: z.infer<typeof subscriptionSchema>, userAgent: string | null): Promise<void> {
  await db()
    .insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 200) ?? null })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, failures: 0 } });
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await db().delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export const countSubscriptions = async (userId: string) => (await db().select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))).length;

/** `actionTitle`: texto de un botón dentro de la notificación (al tocarlo abre la misma pantalla `url`). */
export type PushPayload = { title: string; body: string; url: string; tag?: string; actionTitle?: string };

/** Manda la notificación a todos los dispositivos del usuario. Devuelve cuántos la recibieron. */
export async function sendToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!pushConfigured()) return { sent: 0, failed: 0 };
  const e = env();
  webpush.setVapidDetails(e.VAPID_SUBJECT!, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  const subs = await db().select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    if (!isPushEndpoint(s.endpoint)) {
      await db().delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      continue;
    }
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...payload, url: payload.url.startsWith("/") ? payload.url : "/hoy" }), { TTL: 6 * 3600, urgency: "normal" });
      sent += 1;
      await db().update(pushSubscriptions).set({ lastSentAt: new Date(), failures: 0 }).where(eq(pushSubscriptions.id, s.id));
    } catch (err) {
      failed += 1;
      const status = (err as { statusCode?: number }).statusCode;
      // 404 o 410: el dispositivo ya no existe (desinstaló o revocó el permiso).
      if (status === 404 || status === 410 || s.failures >= 4) await db().delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      else await db().update(pushSubscriptions).set({ failures: s.failures + 1 }).where(eq(pushSubscriptions.id, s.id));
    }
  }
  return { sent, failed };
}
