import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/** Frases que delatan un error interno (proveedores de IA, base de datos, ffmpeg…): a los clientes no se les muestran. */
const INTERNAL = /anthropic|gemini|claude|apify|stripe|minio|ffmpeg|ffprobe|failed query|econn|etimedout|enotfound|fetch failed|api[ _-]?key|credit|quota|rate limit|\bjson\b|esquema|schema|stack|postgres|\bsql\b|relation |undefined|\bnull\b|\bat \w+ \(|http \d{3}|respondió \d{3}|\b(4|5)\d{2}\b.*:|\{"|<html/i;

export const GENERIC_ERROR = "No pudimos completarlo en este momento. Ya quedó registrado; inténtalo de nuevo en unos minutos.";

/** Un mensaje apto para clientes: los textos propios de la app (en español, sin tecnicismos) pasan; los técnicos se cambian por uno genérico. */
export function friendlyError(raw: string | null | undefined, fallback = GENERIC_ERROR): string {
  const t = (raw ?? "").trim();
  if (!t || t.length > 280 || INTERNAL.test(t)) return fallback;
  return t;
}

/** Lo que se le muestra a una persona: el administrador ve el detalle técnico completo; los demás, un mensaje claro. */
export async function shownError(userId: string, raw: string | null | undefined, fallback?: string): Promise<string> {
  if (!raw) return fallback ?? GENERIC_ERROR;
  const [u] = await db().select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.role === "admin" ? raw : friendlyError(raw, fallback);
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const [u] = await db().select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.role === "admin";
}

/** Igual que shownError pero con el rol ya sabido (para pantallas con varios mensajes). */
export const showFor = (admin: boolean, raw: string | null | undefined, fallback?: string) => (admin ? (raw ?? fallback ?? GENERIC_ERROR) : friendlyError(raw, fallback));
