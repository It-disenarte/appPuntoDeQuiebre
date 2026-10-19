import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { decryptSecret, encryptSecret, encryptionConfigured } from "@/lib/crypto";
import { db } from "@/lib/db";
import { igConnections, igMedia } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { exchangeCode, fetchMedia, fetchMediaInsights, fetchProfile, InstagramError, instagramConfigured, longLivedToken, refreshToken, SCOPES } from "./api";

export type Connection = typeof igConnections.$inferSelect;
type Result = { ok: true } | { ok: false; error: string };

export const canConnect = () => instagramConfigured() && encryptionConfigured();
export const newState = () => randomBytes(24).toString("base64url");

export async function getConnection(userId: string): Promise<Connection | null> {
  const [c] = await db().select().from(igConnections).where(eq(igConnections.userId, userId)).limit(1);
  return c ?? null;
}
export const profileOf = (c: Connection | null): { followers: number; follows: number; mediaCount: number } => {
  const p = (c?.profile && typeof c.profile === "object" ? c.profile : {}) as Record<string, unknown>;
  return { followers: Number(p.followers ?? 0) || 0, follows: Number(p.follows ?? 0) || 0, mediaCount: Number(p.mediaCount ?? 0) || 0 };
};

/** Termina la conexión: recibe el código que Instagram mandó al callback, guarda el token cifrado y trae el perfil. */
export async function completeConnection(userId: string, code: string): Promise<Result> {
  if (!canConnect()) return { ok: false, error: "La conexión con Instagram todavía no está configurada." };
  try {
    const short = await exchangeCode(code.replace(/#_$/, ""));
    const long = await longLivedToken(short.token);
    const profile = await fetchProfile(long.token);
    if (profile.accountType && !["BUSINESS", "MEDIA_CREATOR", "CREATOR"].includes(profile.accountType.toUpperCase())) return { ok: false, error: "Tu cuenta debe ser profesional (creador o empresa). Cámbiala en Instagram y vuelve a conectar." };
    const igUserId = profile.userId || short.userId;
    const [taken] = await db().select({ userId: igConnections.userId }).from(igConnections).where(eq(igConnections.igUserId, igUserId)).limit(1);
    if (taken && taken.userId !== userId) return { ok: false, error: "Esa cuenta de Instagram ya está conectada a otro usuario." };
    const values = { igUserId, username: profile.username, name: profile.name, accountType: profile.accountType, tokenEnc: encryptSecret(long.token), tokenExpiresAt: long.expiresAt, scopes: SCOPES.join(","), profile: { followers: profile.followers, follows: profile.follows, mediaCount: profile.mediaCount }, lastSyncAt: new Date(), lastError: null };
    await db().insert(igConnections).values({ userId, ...values }).onConflictDoUpdate({ target: igConnections.userId, set: values });
    return { ok: true };
  } catch (e) {
    console.error("[instagram] no se pudo conectar", e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof InstagramError ? "Instagram no aceptó la conexión. Intenta de nuevo." : "No se pudo conectar tu Instagram. Intenta de nuevo." };
  }
}

export async function disconnect(userId: string): Promise<void> {
  await db().delete(igMedia).where(eq(igMedia.userId, userId));
  await db().delete(igConnections).where(eq(igConnections.userId, userId));
}

const tokenOf = (c: Connection) => decryptSecret(c.tokenEnc);

/** Trae perfil, publicaciones recientes y sus métricas. Si el token ya no sirve, lo deja anotado para pedir reconectar. */
export async function syncConnection(userId: string): Promise<Result> {
  const c = await getConnection(userId);
  if (!c) return { ok: false, error: "No hay una cuenta conectada." };
  try {
    const token = tokenOf(c);
    const [profile, media] = await Promise.all([fetchProfile(token), fetchMedia(token, 30)]);
    for (const m of media) {
      const insights = await fetchMediaInsights(token, m.id);
      const metrics = { likes: m.likes, comments: m.comments, ...insights };
      await db()
        .insert(igMedia)
        .values({ userId, igMediaId: m.id, mediaType: m.mediaType, permalink: m.permalink, caption: m.caption, postedAt: m.postedAt, metrics, syncedAt: new Date() })
        .onConflictDoUpdate({ target: [igMedia.userId, igMedia.igMediaId], set: { mediaType: m.mediaType, permalink: m.permalink, caption: m.caption, postedAt: m.postedAt, metrics, syncedAt: new Date() } });
    }
    await db().update(igConnections).set({ username: profile.username || c.username, name: profile.name, accountType: profile.accountType, profile: { followers: profile.followers, follows: profile.follows, mediaCount: profile.mediaCount }, lastSyncAt: new Date(), lastError: null }).where(eq(igConnections.userId, userId));
    return { ok: true };
  } catch (e) {
    const expired = e instanceof InstagramError && (e.code === 190 || e.status === 401);
    const msg = expired ? "Tu permiso de Instagram caducó. Vuelve a conectar tu cuenta." : "No pudimos leer tu Instagram ahora. Intenta de nuevo más tarde.";
    await db().update(igConnections).set({ lastError: msg }).where(eq(igConnections.userId, userId));
    console.error("[instagram] sincronización falló", e instanceof Error ? e.message : e);
    return { ok: false, error: msg };
  }
}

export async function listMedia(userId: string, limit = 12) {
  return db().select().from(igMedia).where(eq(igMedia.userId, userId)).orderBy(igMedia.postedAt).limit(200).then((rows) => rows.sort((a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0)).slice(0, limit));
}

/** Renueva los tokens que vencen pronto (duran 60 días; Instagram permite renovarlos una vez al día). Lo corre el worker. */
export async function refreshExpiringTokens(now = new Date()): Promise<{ refreshed: number; failed: number }> {
  const soon = new Date(now.getTime() + 20 * 86_400_000);
  const rows = await db().select().from(igConnections).where(lt(igConnections.tokenExpiresAt, soon));
  let refreshed = 0;
  let failed = 0;
  for (const c of rows) {
    try {
      const r = await refreshToken(tokenOf(c));
      await db().update(igConnections).set({ tokenEnc: encryptSecret(r.token), tokenExpiresAt: r.expiresAt, lastError: null }).where(eq(igConnections.id, c.id));
      refreshed += 1;
    } catch (e) {
      failed += 1;
      const expired = c.tokenExpiresAt < now || (e instanceof InstagramError && e.code === 190);
      await db().update(igConnections).set({ lastError: expired ? "Tu permiso de Instagram caducó. Vuelve a conectar tu cuenta." : "No pudimos renovar tu permiso de Instagram." }).where(eq(igConnections.id, c.id));
    }
  }
  return { refreshed, failed };
}

/** Sincroniza a todas las cuentas conectadas (1 vez al día). */
export async function syncAll(): Promise<{ ok: number; failed: number }> {
  const rows = await db().select({ userId: igConnections.userId, lastError: igConnections.lastError }).from(igConnections);
  let ok = 0;
  let failed = 0;
  for (const r of rows) {
    const res = await syncConnection(r.userId);
    if (res.ok) ok += 1;
    else failed += 1;
  }
  return { ok, failed };
}

/* ───────────── Devoluciones de llamada de Meta (desautorizar y borrar datos) ───────────── */

/** Verifica y lee el `signed_request` que Meta manda (firma HMAC-SHA256 con el secreto de la app). Devuelve null si no es válido. */
export function parseSignedRequest(signed: string, secret = env().META_APP_SECRET): { user_id?: string } | null {
  if (!secret) return null;
  const [sig, payload] = signed.split(".");
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user_id?: string | number; algorithm?: string };
    if (data.algorithm && data.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
    return { user_id: data.user_id !== undefined ? String(data.user_id) : undefined };
  } catch {
    return null;
  }
}

/** Borra la conexión y los datos de Instagram de quien pidió desautorizar o eliminar sus datos desde Instagram. */
export async function deleteByIgUser(igUserId: string): Promise<boolean> {
  const [c] = await db().select().from(igConnections).where(eq(igConnections.igUserId, igUserId)).limit(1);
  if (!c) return false;
  await disconnect(c.userId);
  return true;
}


