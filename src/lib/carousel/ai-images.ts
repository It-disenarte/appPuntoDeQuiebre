import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { getLimits } from "@/lib/admin/limits";
import { geminiConfigured, geminiGenerateImage } from "@/lib/ai/gemini";
import { getSubscription } from "@/lib/billing/service";
import { db } from "@/lib/db";
import { aiCalls } from "@/lib/db/schema";
import type { CarruselOut, Slide } from "./schemas";
import { MAX_AI_IMAGES } from "./schemas";
import { addImage, getCarousel, parseAnswers, parseContent, parseImages } from "./service";

type Result = { ok: true } | { ok: false; error: string };
const SKILL = "imagen-carrusel";

const monthStart = (now = new Date()) => {
  const [y, m] = now.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }).split("-");
  return new Date(`${y}-${m}-01T06:00:00Z`);
};

/** Cuántas imágenes con IA puede crear este mes según su plan (los límites los cambia el admin). */
export async function imageQuota(userId: string): Promise<{ enabled: boolean; used: number; limit: number; left: number }> {
  const [sub, limits] = await Promise.all([getSubscription(userId), getLimits()]);
  const limit = sub?.plan === "pro" ? limits.aiImagesMonthlyPro : limits.aiImagesMonthlyBasico;
  const [{ n }] = await db().select({ n: count() }).from(aiCalls).where(and(eq(aiCalls.userId, userId), eq(aiCalls.skill, SKILL), eq(aiCalls.status, "ok"), gte(aiCalls.createdAt, monthStart())));
  const used = n ?? 0;
  return { enabled: geminiConfigured() && limit > 0, used, limit, left: Math.max(0, limit - used) };
}

/** El texto que se le manda al generador: el prompt de la skill + el estilo común + reglas para que la imagen sirva de fondo del slide. */
export function buildImagePrompt(content: CarruselOut, slide: Slide, aparece: string | null): string {
  const zona = slide.imagen.zona_texto;
  return [
    slide.imagen.prompt_ia ?? "",
    content.bloque_estilo_ia ? "Estilo común de todas las imágenes del carrusel: " + content.bloque_estilo_ia : "",
    "Formato vertical 4:5 (como una publicación de Instagram).",
    zona && zona !== "ninguna" ? "Deja despejada la zona " + zona + " de la imagen, porque ahí se colocará texto encima (sin detalles importantes ahí)." : "",
    "NO escribas texto, letras, números, logotipos ni marcas de agua dentro de la imagen: el texto lo coloca la app.",
    aparece === "no" ? "No incluyas personas." : "Si aparecen personas, que no sean retratos de nadie en particular.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function log(userId: string, status: "ok" | "error") {
  await db().insert(aiCalls).values({ userId, skill: SKILL, skillVersion: "gemini-image", mock: false, status, costCents: 0 }).catch(() => undefined);
}

/** Crea con IA la imagen de UN slide y la coloca sola (reemplaza la que tuviera). */
export async function generateSlideImage(userId: string, id: string, n: number): Promise<Result> {
  if (!geminiConfigured()) return { ok: false, error: "La creación de imágenes con IA todavía no está activada (falta la llave de Gemini)." };
  const row = await getCarousel(userId, id);
  const content = row && parseContent(row.content);
  const slide = content?.slides.find((s) => s.n === n);
  if (!row || !content || !slide) return { ok: false, error: "Ese slide no existe." };
  if (!slide.imagen.prompt_ia) return { ok: false, error: "Este slide no tiene un prompt para crear la imagen. Sube una foto tuya." };
  const q = await imageQuota(userId);
  if (q.left <= 0) return { ok: false, error: q.limit === 0 ? "Las imágenes con IA no están incluidas en tu plan." : "Ya usaste tus " + q.limit + " imágenes con IA de este mes. Puedes subir fotos propias o esperar al día 1." };
  try {
    const img = await geminiGenerateImage(buildImagePrompt(content, slide, parseAnswers(row.answers)?.aparece_creador ?? null), { aspectRatio: "4:5" });
    await log(userId, "ok");
    return await addImage(userId, id, n, img.data, img.mime);
  } catch (err) {
    await log(userId, "error");
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo crear la imagen." };
  }
}

/** Crea las imágenes con IA que faltan, una por una, hasta donde alcance el cupo. Si alguna falla, las demás siguen y al final se avisa. */
export async function generateAllImages(userId: string, id: string): Promise<Result> {
  const row = await getCarousel(userId, id);
  const content = row && parseContent(row.content);
  if (!row || !content) return { ok: false, error: "Ese carrusel todavía no tiene slides." };
  const have = parseImages(row.images);
  const todo = content.slides.filter((s) => s.imagen.fuente === "ia" && s.imagen.prompt_ia && !have[String(s.n)]).slice(0, MAX_AI_IMAGES);
  if (todo.length === 0) return { ok: false, error: "No falta ninguna imagen con IA en este carrusel." };
  const failures: string[] = [];
  let made = 0;
  for (const s of todo) {
    const r = await generateSlideImage(userId, id, s.n);
    if (r.ok) made += 1;
    else {
      failures.push("slide " + s.n + ": " + r.error);
      if (/Ya usaste|no están incluidas|llave de Gemini/.test(r.error)) break; // sin cupo no tiene caso seguir
    }
  }
  if (made === 0) return { ok: false, error: failures[0] ?? "No se pudo crear ninguna imagen." };
  if (failures.length > 0) return { ok: false, error: "Se crearon " + made + " imágenes, pero no se pudo: " + failures.slice(0, 2).join(" · ") };
  return { ok: true };
}
