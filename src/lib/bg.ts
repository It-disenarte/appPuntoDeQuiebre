import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs";

/**
 * Pasos con IA que corren en el worker (así siguen aunque la persona salga de la app y la pantalla muestra su avance al volver).
 * Cada paso tiene un `scope` (la pantalla o la pieza a la que pertenece): solo uno activo por scope a la vez.
 */
export type BgOp = "textos" | "tendencias.pedir" | "tendencias.otras" | "tendencias.elegir" | "directos.respuestas" | "directos.semana" | "directos.apoyo" | "perfil.generar" | "perfil.parte" | "auditoria";

export const BG_LABEL: Record<BgOp, { title: string; text: string }> = {
  textos: { title: "Escribiendo tus textos…", text: "Ganchos, descripción y hashtags para cada red, con tu voz." },
  "tendencias.pedir": { title: "Buscando ideas con las tendencias…", text: "Tomamos lo que está de moda y lo adaptamos a tu marca." },
  "tendencias.otras": { title: "Buscando otras ideas…", text: "Armando una nueva ronda con tu nota." },
  "tendencias.elegir": { title: "Armando tu idea…", text: "Convirtiendo la tendencia que elegiste en una idea lista para grabar." },
  "directos.respuestas": { title: "Preparando tu recomendación…", text: "Con tus respuestas armamos cómo y cuándo hacer directos." },
  "directos.semana": { title: "Armando tu guía de directos…", text: "Escribiendo qué decir en cada directo de la semana." },
  "directos.apoyo": { title: "Preparando tu apoyo para el directo…", text: "Armando ideas y guía para ese tema." },
  "perfil.generar": { title: "Preparando tus propuestas…", text: "Revisando tu perfil y escribiendo mejoras para tu nombre y tu biografía." },
  "perfil.parte": { title: "Escribiendo otra propuesta…", text: "Armando nuevas opciones con tu nota." },
  auditoria: { title: "Revisando tu cuenta…", text: "Mirando tu perfil y tus publicaciones para decirte cómo te ven." },
};

const STALE_MS = 15 * 60 * 1000;

export type BgJob = { status: "pendiente" | "corriendo" | "lista" | "error"; error: string | null; op: BgOp; createdAt: Date; active: boolean; recent: boolean };

export async function latestBg(userId: string, scope: string): Promise<BgJob | null> {
  const [row] = await db()
    .select({ status: jobs.status, error: jobs.error, payload: jobs.payload, createdAt: jobs.createdAt })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.kind, "ia.paso"), sql`${jobs.payload}->>'scope' = ${scope}`))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  if (!row) return null;
  const recent = Date.now() - row.createdAt.getTime() < STALE_MS;
  return { status: row.status, error: row.error, op: ((row.payload as { op?: BgOp }).op ?? "textos") as BgOp, createdAt: row.createdAt, recent, active: recent && (row.status === "pendiente" || row.status === "corriendo") };
}

/** Pide un paso con IA al worker. Si ya hay uno en marcha en ese scope, avisa. */
export async function queueBg(userId: string, scope: string, op: BgOp, args: Record<string, unknown> = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [active] = await db()
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.kind, "ia.paso"), sql`${jobs.payload}->>'scope' = ${scope}`, inArray(jobs.status, ["pendiente", "corriendo"]), gt(jobs.createdAt, new Date(Date.now() - STALE_MS))))
    .limit(1);
  if (active) return { ok: false, error: "Ya estamos trabajando en esto. Espera a que termine." };
  await enqueue("ia.paso", userId, { scope, op, args }, { maxAttempts: 1 });
  return { ok: true };
}

type Result = { ok: true } | { ok: false; error: string };

/** Lo que corre el worker: el mismo paso de siempre; si no se pudo, el trabajo queda en error con su motivo. */
export async function runBgOp(userId: string, payload: { scope: string; op: BgOp; args?: Record<string, unknown> }): Promise<void> {
  const a = payload.args ?? {};
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  let r: Result;
  switch (payload.op) {
    case "textos":
      r = await (await import("@/lib/plan/service")).generateTexts(userId, s("pieceId"));
      break;
    case "tendencias.pedir":
      r = await (await import("@/lib/trends/service")).requestUse(userId);
      break;
    case "tendencias.otras":
      r = await (await import("@/lib/trends/service")).refreshUse(userId, s("uso"), s("nota"));
      break;
    case "tendencias.elegir":
      r = await (await import("@/lib/trends/service")).chooseTrend(userId, s("uso"), s("tendencia"));
      break;
    case "directos.respuestas":
      r = await (await import("@/lib/lives/service")).saveAnswers(userId, a.answers);
      break;
    case "directos.semana":
      r = await (await import("@/lib/lives/service")).generateWeek(userId, s("week"));
      break;
    case "directos.apoyo":
      r = await (await import("@/lib/lives/service")).requestSupport(userId, s("tema"));
      break;
    case "perfil.generar":
      r = await (await import("@/lib/profile/service")).generateProfile(userId);
      break;
    case "perfil.parte":
      r = await (await import("@/lib/profile/service")).refreshPart(userId, s("parte") === "nombre" ? "nombre" : "biografia", s("nota"));
      break;
    case "auditoria":
      r = await (await import("@/lib/audit-account/service")).runAudit(userId);
      break;
    default:
      r = { ok: false, error: "Paso desconocido." };
  }
  if (!r.ok) throw new Error(r.error);
}
