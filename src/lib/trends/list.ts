import "server-only";
import { createHash } from "node:crypto";
import { desc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { trendLists } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { todayIso } from "@/lib/plan/rules";
import { trendSchema, type Trend } from "./schemas";

/** Lista de ejemplo para ver todo el flujo mientras no hay un actor de Apify configurado (incluye casos que la skill debe descartar). */
export function sampleList(): Trend[] {
  const t = (id: string, tipo: Trend["tipo"], nombre: string, descripcion: string, estado: Trend["estado"], posicion: number, audio: string | null = null): Trend => ({
    id, tipo, nombre, descripcion, red: "tiktok", pais: "MX", posicion, estado, dias_en_lista: estado === "subiendo" ? 1 : 4, publicaciones: 12_000 * (11 - posicion), link_ejemplo: null, audio: { nombre: audio, link: null },
  });
  return [
    t("m-1", "formato", "Antes y después en un chasquido", "Transformación rápida con corte al chasquido de dedos.", "pico", 1),
    t("m-2", "cancion", "Piano suave (versión lenta)", "Audio tranquilo para mostrar un proceso creativo.", "subiendo", 2, "Piano suave (versión lenta)"),
    t("m-3", "hashtag", "#DatoQueNoSabías", "Un dato curioso en 20 segundos con texto en pantalla.", "subiendo", 3),
    t("m-4", "formato", "Reto peligroso del momento", "Reto físico arriesgado.", "pico", 4),
    t("m-5", "cancion", "Éxito en bajada", "Canción que ya perdió fuerza.", "bajando", 5, "Éxito en bajada"),
    t("m-6", "hashtag", "#MiPrimerCarrusel", "Muestra tu primer intento en algo nuevo.", "subiendo", 6),
    t("m-7", "formato", "Esto o aquello", "Dos opciones en pantalla dividida y el público elige.", "pico", 7),
    t("m-8", "formato", "Un día en mi vida creando", "Resumen rápido de tu día con cortes al ritmo del audio.", "subiendo", 8),
    t("m-9", "hashtag", "#ConsejoRápido", "Un consejo de 15 segundos directo a cámara.", "pico", 9),
    t("m-10", "cancion", "Beat motivacional", "Audio enérgico para mostrar un logro pequeño.", "subiendo", 10, "Beat motivacional"),
    t("m-11", "formato", "Lo que nadie te dice de…", "Revela algo que casi nadie cuenta de tu tema.", "pico", 11),
    t("m-12", "hashtag", "#TipsParaPrincipiantes", "Lista corta de errores al empezar.", "subiendo", 12),
  ];
}

const pick = (o: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
};
const num = (o: Record<string, unknown>, keys: string[]): number => {
  for (const k of keys) {
    const v = Number(o[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 0;
};
const link = (s: string | null) => (s && /^https:\/\//i.test(s) && s.length <= 500 ? s : null);

/**
 * Convierte lo que devuelva el actor a nuestro formato. Los nombres de los campos dependen del actor elegido, así que se
 * leen varias alternativas comunes; el estado (subiendo, pico, bajando) se calcula con el historial de nuestra propia lista.
 */
export function normalizeItems(raw: unknown[], previous: Trend[]): Trend[] {
  const prev = new Map(previous.map((t) => [t.id, t]));
  const out: Trend[] = [];
  raw.forEach((r, i) => {
    if (!r || typeof r !== "object") return;
    const o = r as Record<string, unknown>;
    const name = pick(o, ["name", "title", "hashtagName", "hashtag", "musicTitle", "music", "songName", "topic"]);
    if (!name) return;
    const isSong = Boolean(pick(o, ["musicTitle", "songName", "music"])) && !pick(o, ["hashtagName", "hashtag"]);
    const isTag = Boolean(pick(o, ["hashtagName", "hashtag"])) || name.startsWith("#");
    const tipo: Trend["tipo"] = isSong ? "cancion" : isTag ? "hashtag" : "formato";
    const id = `t-${createHash("sha1").update(`${tipo}:${name.toLowerCase()}`).digest("hex").slice(0, 10)}`;
    // Algunos actores (p. ej. el de hashtags por industria) repiten el rank en cada grupo: ahí vale el orden en que vienen.
    const stage = (pick(o, ["trendStage", "stage", "estado"]) ?? "").toLowerCase();
    const posicion = stage ? i + 1 : num(o, ["rank", "position", "posicion"]) || i + 1;
    const before = prev.get(id);
    const staged: Trend["estado"] | null = /break|rising|new|surg|subiendo/.test(stage) ? "subiendo" : /peak|hot|pico/.test(stage) ? "pico" : /fad|declin|fall|bajando/.test(stage) ? "bajando" : null;
    const estado: Trend["estado"] = staged ? staged : !before ? "subiendo" : posicion < before.posicion ? "subiendo" : posicion > before.posicion + 2 ? "bajando" : before.dias_en_lista >= 3 ? "pico" : "subiendo";
    out.push({
      id,
      tipo,
      nombre: (tipo === "hashtag" && !name.startsWith("#") ? "#" + name : name).slice(0, 120),
      descripcion: (pick(o, ["description", "desc", "descripcion"]) ?? "").slice(0, 300),
      red: "tiktok",
      pais: "MX",
      posicion,
      estado,
      dias_en_lista: (before?.dias_en_lista ?? 0) + 1,
      publicaciones: num(o, ["videoCount", "postCount", "publishCnt", "publicaciones", "posts"]),
      link_ejemplo: link(pick(o, ["videoUrl", "exampleUrl", "link", "url", "tiktokUrl"])),
      audio: { nombre: tipo === "cancion" ? name : pick(o, ["musicTitle", "songName"]), link: link(pick(o, ["musicUrl", "audioUrl"])) },
    });
  });
  return out.slice(0, 30);
}

export async function latestList(): Promise<{ day: string; items: Trend[]; source: "apify" | "muestra"; createdAt: Date } | null> {
  const [r] = await db().select().from(trendLists).orderBy(desc(trendLists.day)).limit(1);
  if (!r) return null;
  const items = (Array.isArray(r.items) ? r.items : []).map((x) => trendSchema.safeParse(x)).flatMap((p) => (p.success ? [p.data] : []));
  return { day: r.day, items, source: r.source, createdAt: r.createdAt };
}

/** Posponer el siguiente intento de bajar tendencias reales (si el actor falla, no se reintenta en cada visita). */
export async function deferTrendsRetry(day: string): Promise<void> {
  await db().update(trendLists).set({ createdAt: new Date() }).where(eq(trendLists.day, day));
}

/** Baja la lista del día con el actor configurado (o guarda la de ejemplo) y la guarda. La corre el worker 1 vez al día. */
export async function refreshTrends(today = todayIso()): Promise<{ source: "apify" | "muestra"; count: number }> {
  const e = env();
  let source: "apify" | "muestra" = "muestra";
  let items = sampleList();
  if (e.APIFY_TOKEN && e.APIFY_TRENDS_ACTOR) {
    let input: Record<string, unknown> = {};
    try {
      input = e.APIFY_TRENDS_INPUT ? (JSON.parse(e.APIFY_TRENDS_INPUT) as Record<string, unknown>) : {};
    } catch {
      throw new Error("APIFY_TRENDS_INPUT no es un JSON válido");
    }
    const res = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(e.APIFY_TRENDS_ACTOR.replace("/", "~"))}/run-sync-get-dataset-items`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${e.APIFY_TOKEN}` },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(280_000),
    });
    if (!res.ok) throw new Error(`Apify respondió ${res.status}`);
    const data = (await res.json()) as unknown;
    const [prev] = await db().select().from(trendLists).where(lt(trendLists.day, today)).orderBy(desc(trendLists.day)).limit(1);
    const previous = (Array.isArray(prev?.items) ? prev.items : []).map((x) => trendSchema.safeParse(x)).flatMap((p) => (p.success ? [p.data] : []));
    items = normalizeItems(Array.isArray(data) ? data : [], previous);
    if (items.length === 0) throw new Error("El actor no devolvió tendencias reconocibles");
    source = "apify";
  }
  await db().insert(trendLists).values({ day: today, items, source }).onConflictDoUpdate({ target: trendLists.day, set: { items, source } });
  return { source, count: items.length };
}


