import "server-only";
import { env } from "@/lib/env";
import { USERNAME_RE } from "./schemas";

/**
 * Cliente de Apify (raspado de Instagram). Misma idea que el analizador de referencia: se le pide a la actor oficial
 * `apify/instagram-scraper` los posts recientes de una cuenta y se queda con los videos. La llave va en el encabezado
 * `Authorization`, no en la URL.
 */
export const apifyConfigured = () => Boolean(env().APIFY_TOKEN);

const ACTOR = "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items";

export type ScrapedReel = {
  videoUrl: string;
  postUrl: string;
  views: number;
  likes: number;
  comments: number;
  username: string;
  thumbnail: string;
  datePosted: string; // AAAA-MM-DD
};

type RawPost = { videoUrl?: string; url?: string; videoPlayCount?: number; likesCount?: number; commentsCount?: number; ownerUsername?: string; images?: string[]; displayUrl?: string; timestamp?: string };

async function callActor<T>(body: Record<string, unknown>, timeoutMs = 280_000): Promise<T[]> {
  const res = await fetch(ACTOR, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env().APIFY_TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Apify respondió ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  return Array.isArray(data) ? (data as T[]) : [];
}

/** Reels recientes de una cuenta, de los más vistos a los menos vistos, dentro de la ventana de días. */
export async function scrapeReels(username: string, maxVideos: number, nDays: number, now = new Date()): Promise<ScrapedReel[]> {
  if (!USERNAME_RE.test(username)) throw new Error("Cuenta no válida");
  const since = new Date(now.getTime() - nDays * 86_400_000);
  const posts = await callActor<RawPost>({
    addParentData: false,
    directUrls: [`https://www.instagram.com/${username}/`],
    enhanceUserSearchWithFacebookPage: false,
    isUserReelFeedURL: false,
    isUserTaggedFeedURL: false,
    onlyPostsNewerThan: since.toISOString().slice(0, 10),
    resultsLimit: maxVideos,
    resultsType: "stories",
  });
  return pickTop(posts, username, since).sort((a, b) => b.views - a.views);
}

/** Convierte lo que devuelve Apify en reels válidos (con video y fecha dentro de la ventana). Sin red: se prueba aparte. */
export function pickTop(posts: RawPost[], username: string, since: Date): ScrapedReel[] {
  const out: ScrapedReel[] = [];
  for (const p of posts) {
    if (!p.videoUrl || !p.url || !p.timestamp) continue;
    const t = new Date(p.timestamp);
    if (Number.isNaN(t.getTime()) || t < since) continue;
    out.push({
      videoUrl: p.videoUrl,
      postUrl: p.url,
      views: Math.max(0, Math.floor(p.videoPlayCount ?? 0)),
      likes: Math.max(0, Math.floor(p.likesCount ?? 0)),
      comments: Math.max(0, Math.floor(p.commentsCount ?? 0)),
      username: (p.ownerUsername || username).toLowerCase(),
      thumbnail: p.images?.[0] ?? p.displayUrl ?? "",
      datePosted: p.timestamp.slice(0, 10),
    });
  }
  return out;
}

export type CreatorStats = { followers: number; reels30d: number; avgViews30d: number };

/** Seguidores y actividad de los últimos 30 días de una cuenta (2 consultas). */
export async function scrapeCreatorStats(username: string, now = new Date()): Promise<CreatorStats> {
  if (!USERNAME_RE.test(username)) throw new Error("Cuenta no válida");
  const details = await callActor<{ followersCount?: number }>({ directUrls: [`https://www.instagram.com/${username}/`], resultsType: "details", resultsLimit: 1 });
  const followers = Math.max(0, Math.floor(details[0]?.followersCount ?? 0));
  const reels = await scrapeReels(username, 100, 30, now);
  const reels30d = reels.length;
  const avgViews30d = reels30d ? Math.round(reels.reduce((s, r) => s + r.views, 0) / reels30d) : 0;
  return { followers, reels30d, avgViews30d };
}
