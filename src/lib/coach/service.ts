import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, count, eq, gte, ne } from "drizzle-orm";
import { getLimits } from "@/lib/admin/limits";
import { geminiConfigured, geminiGenerate, geminiUploadFile, parseJson } from "@/lib/ai/gemini";
import { getManual, getVoiceProfile } from "@/lib/brujula/service";
import { getSubscription } from "@/lib/billing/service";
import { db } from "@/lib/db";
import { aiCalls, coachReviews } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs";
import { getPiece, parseScript } from "@/lib/plan/service";
import { PARTS, progress, type Part } from "@/lib/recording/rules";
import { listRecordings } from "@/lib/recording/service";
import type { VideoGuion } from "@/lib/skills/schemas";
import { sendToUser } from "@/lib/push";
import { getObject, storageConfigured } from "@/lib/storage";
import { mockReview } from "./mock";
import { coachOutput, MAX_REVIEWS_PER_VIDEO, normalizeReview, voteSchema, type CoachOut } from "./schemas";

export type Review = typeof coachReviews.$inferSelect;
type Result = { ok: true } | { ok: false; error: string };

const MAX_TOTAL_BYTES = 300 * 1024 * 1024;

export const listReviews = (userId: string, pieceId: string): Promise<Review[]> =>
  db().select().from(coachReviews).where(and(eq(coachReviews.userId, userId), eq(coachReviews.pieceId, pieceId))).orderBy(coachReviews.numero);

export const parseResult = (raw: unknown): CoachOut | null => {
  const r = coachOutput.safeParse(raw);
  return r.success ? r.data : null;
};

const monthStart = (now = new Date()) => {
  const [y, m] = now.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }).split("-");
  return new Date(`${y}-${m}-01T06:00:00Z`);
};

/** Cuántas revisiones lleva este mes y cuántas le tocan según su plan (configurable por el administrador). */
export async function monthlyQuota(userId: string): Promise<{ used: number; limit: number }> {
  const [sub, limits] = await Promise.all([getSubscription(userId), getLimits()]);
  const [{ n }] = await db().select({ n: count() }).from(coachReviews).where(and(eq(coachReviews.userId, userId), ne(coachReviews.numero, 0), ne(coachReviews.status, "error"), gte(coachReviews.createdAt, monthStart())));
  return { used: n ?? 0, limit: sub?.plan === "pro" ? limits.coachMonthlyPro : limits.coachMonthlyBasico };
}

/** ¿Hay una toma nueva desde la revisión anterior? (regrabó alguna parte) */
export async function hasNewTake(userId: string, pieceId: string, since: Date): Promise<boolean> {
  const recs = await listRecordings(userId, pieceId);
  return recs.some((r) => r.updatedAt > since);
}

/** “Así lo publico”: no se vuelve a preguntar por este video. */
export async function declineReview(userId: string, pieceId: string): Promise<void> {
  const piece = await getPiece(userId, pieceId);
  if (!piece || piece.kind !== "video") return;
  await db().insert(coachReviews).values({ userId, pieceId, numero: 0, status: "omitida" }).onConflictDoNothing();
}

export async function requestReview(userId: string, pieceId: string): Promise<Result> {
  const piece = await getPiece(userId, pieceId);
  if (!piece || piece.kind !== "video") return { ok: false, error: "Esa pieza no existe." };
  if (!storageConfigured()) return { ok: false, error: "El almacenamiento no está configurado." };
  const recs = await listRecordings(userId, pieceId);
  if (!progress(recs.map((r) => r.part as Part)).complete) return { ok: false, error: "Primero sube las 3 partes de tu video." };

  const reviews = await listReviews(userId, pieceId);
  const real = reviews.filter((r) => r.numero >= 1);
  if (real.some((r) => r.status === "procesando")) return { ok: false, error: "Ya estamos revisando este video." };
  const last = real.filter((r) => r.status === "lista").at(-1);
  const failed = real.find((r) => r.status === "error");
  if (last && last.numero >= MAX_REVIEWS_PER_VIDEO) return { ok: false, error: "Este video ya tuvo sus 2 revisiones." };
  if (last && !(await hasNewTake(userId, pieceId, last.createdAt))) return { ok: false, error: "Graba una toma nueva para pedir la segunda revisión." };

  const q = await monthlyQuota(userId);
  if (!failed && q.used >= q.limit) return { ok: false, error: `Ya usaste tus ${q.limit} revisiones de este mes. Se renuevan el día 1.` };

  const numero = failed ? failed.numero : (last?.numero ?? 0) + 1;
  await db().delete(coachReviews).where(and(eq(coachReviews.pieceId, pieceId), eq(coachReviews.numero, 0)));
  if (failed) await db().update(coachReviews).set({ status: "procesando", error: null }).where(eq(coachReviews.id, failed.id));
  else await db().insert(coachReviews).values({ userId, pieceId, numero, status: "procesando" });
  const [row] = await db().select({ id: coachReviews.id }).from(coachReviews).where(and(eq(coachReviews.pieceId, pieceId), eq(coachReviews.numero, numero))).limit(1);
  await enqueue("coach.revisar", userId, { reviewId: row!.id });
  return { ok: true };
}

export async function voteImprovement(userId: string, reviewId: string, index: number, raw: unknown): Promise<Result> {
  const v = voteSchema.safeParse(raw);
  const [r] = await db().select().from(coachReviews).where(and(eq(coachReviews.id, reviewId), eq(coachReviews.userId, userId))).limit(1);
  if (!v.success || !r || index < 0 || index > 5) return { ok: false, error: "No se pudo guardar tu calificación." };
  const votes = (r.votes && typeof r.votes === "object" ? r.votes : {}) as Record<string, unknown>;
  await db().update(coachReviews).set({ votes: { ...votes, [String(index)]: v.data } }).where(eq(coachReviews.id, reviewId));
  return { ok: true };
}

/* ───────────── Ejecución (corre en el worker) ───────────── */

async function logCall(userId: string, mock: boolean, status: "ok" | "error") {
  await db().insert(aiCalls).values({ userId, skill: "coach-video", skillVersion: "coach-video-v2", mock, status, costCents: 0 }).catch(() => undefined);
}

export async function runReview(userId: string, reviewId: string): Promise<void> {
  const [review] = await db().select().from(coachReviews).where(and(eq(coachReviews.id, reviewId), eq(coachReviews.userId, userId))).limit(1);
  if (!review || review.status === "lista") return;
  const piece = await getPiece(userId, review.pieceId);
  const parsed = piece ? parseScript("video", piece.script) : null;
  if (!piece || !parsed || !("cuerpo" in parsed)) throw new Error("La pieza ya no existe");
  const script = parsed as VideoGuion;
  await db().update(coachReviews).set({ status: "procesando", error: null }).where(eq(coachReviews.id, reviewId));

  try {
    let out: CoachOut;
    let mock = false;
    if (geminiConfigured()) {
      const recs = (await listRecordings(userId, review.pieceId)).sort((a, b) => PARTS.indexOf(a.part as Part) - PARTS.indexOf(b.part as Part));
      if (recs.reduce((s, r) => s + r.bytes, 0) > MAX_TOTAL_BYTES) throw new Error("El video es demasiado pesado para revisarlo. Graba partes más cortas.");
      const [manual, voice, plan] = await Promise.all([getManual(userId).catch(() => null), getVoiceProfile(userId).catch(() => null), getSubscription(userId)]);
      const previous = review.numero >= 2 ? parseResult((await listReviews(userId, review.pieceId)).find((r) => r.numero === 1)?.result) : null;
      const input = {
        creador_id: userId,
        plan: plan?.plan ?? "basico",
        video: { url: "adjunto", duracion_s: recs.reduce((s, r) => s + r.seconds, 0), red_destino: ["instagram"], formato: "reel", nota: "El video llega en 3 archivos, en orden: gancho, cuerpo y cierre. Revísalos como un solo video." },
        pieza: { dia: piece.day, pilar: piece.pillar, tema: piece.topic, guion: { gancho: script.gancho, desarrollo: script.cuerpo.join(" "), cierre_cta: script.cierre }, uso_teleprompter: false },
        brujula: { pilares: manual?.content.pilares.map((p) => p.nombre) ?? [], tono: manual?.content.tono ?? null, palabras_si: manual?.content.palabras_si ?? [] },
        perfil_voz: { muletillas_propias: (voice?.content.muletillas ?? []).map((m) => m.texto), ritmo: voice?.content.ritmo ?? "", energia: voice?.content.energia ?? "" },
        horario: { lugar: "", luz: "natural", momento: "tarde" },
        revision: { numero: review.numero, anterior: previous },
      };
      const skill = await readFile(path.join(process.cwd(), "skills", "coach-video", "v2", "skill.md"), "utf8");
      const parts: Parameters<typeof geminiGenerate>[0] = [{ text: `${skill}\n\nEntrada:\n${JSON.stringify(input)}\n\nResponde solo con el JSON de salida.` }];
      for (const r of recs) {
        const obj = await getObject(r.objectKey);
        if (!obj) throw new Error("No se encontró una de las partes del video");
        const file = await geminiUploadFile(Buffer.from(await new Response(obj.body).arrayBuffer()), r.contentType);
        parts.push({ text: `Parte «${r.part}»:` }, { file });
      }
      out = normalizeReview(coachOutput.parse(parseJson(await geminiGenerate(parts, { json: true, timeoutMs: 180_000 }))), review.numero);
      await logCall(userId, false, "ok");
    } else {
      out = normalizeReview(mockReview(review.numero, script.gancho), review.numero);
      mock = true;
      await logCall(userId, true, "ok");
    }
    await db().update(coachReviews).set({ status: "lista", result: out, mock, error: null }).where(eq(coachReviews.id, reviewId));
    void sendToUser(userId, { title: "Tu revisión está lista", body: "El Lente ya vio tu video y te dejó su opinión.", url: `/grabar?pieza=${review.pieceId}`, tag: `coach-${reviewId}` }).catch(() => undefined);
  } catch (err) {
    await logCall(userId, false, "error");
    await db().update(coachReviews).set({ status: "error", error: (err instanceof Error ? err.message : "No se pudo revisar el video").slice(0, 300) }).where(eq(coachReviews.id, reviewId));
    throw err;
  }
}
