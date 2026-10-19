import "server-only";
import { env } from "@/lib/env";

/**
 * Cliente de la API oficial de Instagram (inicio de sesión de Instagram, graph.instagram.com). Solo permisos de lectura:
 * perfil básico e insights. No se pide permiso para editar el perfil. La app nunca ve la contraseña del creador.
 */
export const SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"] as const;
const API = "https://graph.instagram.com";
const VERSION = "v23.0";

export const instagramConfigured = () => Boolean(env().META_APP_ID && env().META_APP_SECRET);
export const redirectUri = () => `${env().APP_URL.replace(/\/$/, "")}/api/instagram/callback`;

export class InstagramError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** 190 = token caducado o revocado. */
    readonly code?: number,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: number } } | null)?.error;
    throw new InstagramError(err?.message ?? `Instagram respondió ${res.status}`, res.status, err?.code);
  }
  return json as T;
}

/** Dirección a la que se manda al creador para que dé su permiso en Instagram. */
export function authorizeUrl(state: string): string {
  const q = new URLSearchParams({ client_id: env().META_APP_ID!, redirect_uri: redirectUri(), response_type: "code", scope: SCOPES.join(","), state });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

export async function exchangeCode(code: string): Promise<{ token: string; userId: string }> {
  const body = new URLSearchParams({ client_id: env().META_APP_ID!, client_secret: env().META_APP_SECRET!, grant_type: "authorization_code", redirect_uri: redirectUri(), code });
  const r = await call<{ access_token?: string; user_id?: string | number; data?: { access_token: string; user_id: string | number }[] }>("https://api.instagram.com/oauth/access_token", { method: "POST", body });
  const d = r.data?.[0] ?? r;
  const token = "access_token" in d ? d.access_token : undefined;
  if (!token || !d.user_id) throw new InstagramError("Instagram no devolvió el permiso", 502);
  return { token, userId: String(d.user_id) };
}

/** Cambia el token corto (1 hora) por uno de larga duración (60 días). */
export async function longLivedToken(short: string): Promise<{ token: string; expiresAt: Date }> {
  const q = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: env().META_APP_SECRET!, access_token: short });
  const r = await call<{ access_token: string; expires_in: number }>(`${API}/access_token?${q}`);
  return { token: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
}

export async function refreshToken(token: string): Promise<{ token: string; expiresAt: Date }> {
  const q = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
  const r = await call<{ access_token: string; expires_in: number }>(`${API}/refresh_access_token?${q}`);
  return { token: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
}

export type IgProfile = { userId: string; username: string; name: string | null; accountType: string | null; followers: number; follows: number; mediaCount: number };

export async function fetchProfile(token: string): Promise<IgProfile> {
  const q = new URLSearchParams({ fields: "user_id,username,name,account_type,followers_count,follows_count,media_count", access_token: token });
  const r = await call<Record<string, unknown>>(`${API}/${VERSION}/me?${q}`);
  return {
    userId: String(r.user_id ?? r.id ?? ""),
    username: String(r.username ?? ""),
    name: typeof r.name === "string" ? r.name : null,
    accountType: typeof r.account_type === "string" ? r.account_type : null,
    followers: Number(r.followers_count ?? 0) || 0,
    follows: Number(r.follows_count ?? 0) || 0,
    mediaCount: Number(r.media_count ?? 0) || 0,
  };
}

export type IgMedia = { id: string; mediaType: string; permalink: string | null; caption: string | null; postedAt: Date | null; likes: number; comments: number };

export async function fetchMedia(token: string, limit = 30): Promise<IgMedia[]> {
  const q = new URLSearchParams({ fields: "id,media_type,permalink,caption,timestamp,like_count,comments_count", limit: String(limit), access_token: token });
  const r = await call<{ data?: Record<string, unknown>[] }>(`${API}/${VERSION}/me/media?${q}`);
  return (r.data ?? []).map((m) => ({
    id: String(m.id),
    mediaType: String(m.media_type ?? "IMAGE"),
    permalink: typeof m.permalink === "string" ? m.permalink : null,
    caption: typeof m.caption === "string" ? m.caption.slice(0, 500) : null,
    postedAt: typeof m.timestamp === "string" && !Number.isNaN(Date.parse(m.timestamp)) ? new Date(m.timestamp) : null,
    likes: Number(m.like_count ?? 0) || 0,
    comments: Number(m.comments_count ?? 0) || 0,
  }));
}

/** Insights de una publicación. Instagram rechaza algunas métricas según el tipo, así que se piden con tolerancia y un error no detiene la sincronización. */
export async function fetchMediaInsights(token: string, mediaId: string): Promise<Record<string, number>> {
  const q = new URLSearchParams({ metric: "reach,saved,shares,total_interactions,views", access_token: token });
  try {
    const r = await call<{ data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`${API}/${VERSION}/${encodeURIComponent(mediaId)}/insights?${q}`);
    return Object.fromEntries((r.data ?? []).map((m) => [m.name, Number(m.total_value?.value ?? m.values?.[0]?.value ?? 0) || 0]));
  } catch (e) {
    if (e instanceof InstagramError && e.code === 190) throw e;
    return {};
  }
}
