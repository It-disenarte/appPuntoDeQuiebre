import "server-only";
import { and, eq, gt, inArray, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentPieces, jobs } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs";
import { getCurrentPlan, singleVideoScript } from "@/lib/plan/service";
import { todayIso } from "@/lib/plan/rules";
import { sendToUser } from "@/lib/push";
import type { VideoGuion } from "@/lib/skills/schemas";
import { getIdea, markIdeasUsed, type BankIdea } from "./bank";

type Result = { ok: true } | { ok: false; error: string };
const STALE_MS = 15 * 60 * 1000;

/** Pide armar el video de una idea del banco (corre en el worker, así sigue aunque cierres la app). */
export async function queueVideoFromIdea(userId: string, ideaId: string): Promise<Result> {
  const idea = await getIdea(userId, ideaId);
  if (!idea) return { ok: false, error: "Esa idea ya no está en tu banco." };
  if (idea.status === "usada" && idea.pieceId) return { ok: false, error: "Esa idea ya es un video de tu semana." };
  if (!(await getCurrentPlan(userId))) return { ok: false, error: "Primero genera tu semana: el video se agrega a ella." };
  const [active] = await db()
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.kind, "idea.video"), sql`${jobs.payload}->>'ideaId' = ${ideaId}`, inArray(jobs.status, ["pendiente", "corriendo"]), gt(jobs.createdAt, new Date(Date.now() - STALE_MS))))
    .limit(1);
  if (active) return { ok: false, error: "Ya estamos armando el guion de esta idea." };
  await enqueue("idea.video", userId, { ideaId }, { maxAttempts: 1 });
  return { ok: true };
}

/**
 * Agrega a la semana actual un video extra con el guion completo de la idea. Es la parte con base de datos del trabajo:
 * recibe el guion ya escrito (la IA lo escribe antes, en runVideoFromIdea).
 */
export async function addVideoPiece(userId: string, idea: BankIdea, v: { pillar: string; script: VideoGuion }): Promise<{ ok: true; pieceId: string } | { ok: false; error: string }> {
  const plan = await getCurrentPlan(userId);
  if (!plan) return { ok: false, error: "Primero genera tu semana: el video se agrega a ella." };
  const planId = plan.plan.id;
  const [last] = await db().select({ n: max(contentPieces.n) }).from(contentPieces).where(eq(contentPieces.planId, planId));
  const publishTime = plan.pieces[0]?.publishTime ?? "18:00";
  const [row] = await db()
    .insert(contentPieces)
    .values({ planId, userId, n: (last?.n ?? 0) + 1, day: todayIso(), publishTime, kind: "video", category: "nicho", type: "prueba", pillar: v.pillar || "Inspiración", topic: idea.title.slice(0, 140), idea: idea.idea.slice(0, 300), script: v.script })
    .returning({ id: contentPieces.id });
  await markIdeasUsed([idea.id], row!.id);
  return { ok: true, pieceId: row!.id };
}

/** Lo que corre el worker: escribe el guion con la IA, lo agrega a la semana y avisa. Si no se puede, el trabajo queda en error con su motivo. */
export async function runVideoFromIdea(userId: string, ideaId: string): Promise<void> {
  const idea = await getIdea(userId, ideaId);
  if (!idea) throw new Error("Esa idea ya no está en tu banco");
  const s = await singleVideoScript(userId, { title: idea.title, hook: idea.hook, idea: idea.idea, shortScript: idea.shortScript });
  if (!s.ok) throw new Error(s.error);
  const r = await addVideoPiece(userId, idea, { pillar: s.pillar, script: s.script });
  if (!r.ok) throw new Error(r.error);
  void sendToUser(userId, { title: "Tu idea ya es un video para grabar", body: idea.title, url: `/semana/${r.pieceId}`, tag: `idea-${ideaId}` }).catch(() => undefined);
}
