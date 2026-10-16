import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brandManuals, brujulas, schedules, voiceSamples } from "@/lib/db/schema";
import { runBrujulaSkill, SKILL_VERSIONS } from "@/lib/skills";
import { BLOCK_IDS, BLOCKS, BRUJULA_VERSION, type AnswerValue, type Answers } from "./content";
import { assembleManual, brujulaSkillOutput, manualContentSchema, type ManualContent } from "./manual";
import { proposalSchema, scheduleAnswersSchema, type ScheduleAnswers, type ScheduleProposal } from "./schedule";
import { voiceProfileSchema, type VoiceProfile } from "./voice";

/* ───────────── Brújula (formulario por bloques) ───────────── */

export async function getBrujula(userId: string) {
  const [row] = await db().select().from(brujulas).where(eq(brujulas.userId, userId)).limit(1);
  return row ?? null;
}

export type BrujulaProgress = { done: number; total: number; nextBlock: string | null; complete: boolean };

export function brujulaProgress(row: { completedBlocks: string[] } | null): BrujulaProgress {
  const done = new Set(row?.completedBlocks ?? []);
  const next = BLOCKS.find((b) => !done.has(b.id));
  return { done: BLOCK_IDS.filter((id) => done.has(id)).length, total: BLOCK_IDS.length, nextBlock: next?.id ?? null, complete: !next };
}

/** Guarda un bloque (mezclado con los demás) y marca si ya se completaron todos. */
export async function saveBlock(userId: string, blockId: string, values: Record<string, AnswerValue>): Promise<{ complete: boolean }> {
  return db().transaction(async (tx) => {
    await tx.insert(brujulas).values({ userId, contentVersion: BRUJULA_VERSION }).onConflictDoNothing();
    const [row] = await tx.select().from(brujulas).where(eq(brujulas.userId, userId)).for("update").limit(1);
    const answers: Answers = { ...row!.answers, [blockId]: values };
    const completed = [...new Set([...row!.completedBlocks, blockId])];
    const complete = BLOCK_IDS.every((id) => completed.includes(id));
    await tx
      .update(brujulas)
      .set({ answers, completedBlocks: completed, contentVersion: BRUJULA_VERSION, completedAt: complete ? (row!.completedAt ?? new Date()) : null })
      .where(eq(brujulas.userId, userId));
    return { complete };
  });
}

/* ───────────── Voz ───────────── */

export async function getVoice(userId: string) {
  const [row] = await db().select().from(voiceSamples).where(eq(voiceSamples.userId, userId)).limit(1);
  if (!row) return null;
  const profile = voiceProfileSchema.safeParse(row.profile);
  return profile.success ? { ...row, profile: profile.data } : null;
}

export async function saveVoice(
  userId: string,
  v: { topic: string; source: "audio" | "texto"; transcript: string; durationSeconds: number | null; profile: VoiceProfile; mock: boolean },
) {
  const values = { ...v, skillVersion: SKILL_VERSIONS.voz };
  await db()
    .insert(voiceSamples)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: voiceSamples.userId, set: { ...values, updatedAt: new Date() } });
}

/* ───────────── Horario ───────────── */

export async function getSchedule(userId: string) {
  const [row] = await db().select().from(schedules).where(eq(schedules.userId, userId)).limit(1);
  if (!row) return null;
  const proposal = proposalSchema.safeParse(row.proposal);
  const answers = scheduleAnswersSchema.safeParse(row.answers);
  if (!proposal.success || !answers.success) return null;
  return { ...row, proposal: proposal.data, answers: answers.data };
}

export async function saveSchedule(userId: string, s: { answers: ScheduleAnswers; proposal: ScheduleProposal; adjusted: boolean; accepted: boolean }) {
  const values = { answers: s.answers, proposal: s.proposal, adjusted: s.adjusted, acceptedAt: s.accepted ? new Date() : null };
  await db()
    .insert(schedules)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: schedules.userId, set: { ...values, updatedAt: new Date() } });
}

/* ───────────── Manual de identidad ───────────── */

export async function getManual(userId: string): Promise<{ content: ManualContent; generatedAt: Date } | null> {
  const [row] = await db().select().from(brandManuals).where(eq(brandManuals.userId, userId)).limit(1);
  if (!row) return null;
  const content = manualContentSchema.safeParse(row.content);
  return content.success ? { content: content.data, generatedAt: row.generatedAt } : null;
}

/**
 * Arma el manual con lo que haya. Necesita la brújula completa; la voz y el horario se suman cuando existan.
 * `regenerateCreative` vuelve a llamar a la skill de brújula (solo cuando cambian las respuestas del formulario);
 * si solo cambia la voz o el horario se reutiliza la parte creativa ya generada (no gasta IA).
 */
export async function rebuildManual(userId: string, opts: { regenerateCreative: boolean }): Promise<boolean> {
  const form = await getBrujula(userId);
  if (!form || !brujulaProgress(form).complete) return false;

  const existing = await getManual(userId);
  const creative = !opts.regenerateCreative && existing ? existing.content.creative : await runBrujulaSkill(userId, form.answers);
  const voice = await getVoice(userId);
  const schedule = await getSchedule(userId);

  const content = manualContentSchema.parse(
    assembleManual({
      answers: form.answers,
      creative: brujulaSkillOutput.parse(creative),
      voice: voice ? { profile: voice.profile, mock: voice.mock } : null,
      schedule: schedule?.proposal ?? null,
    }),
  );
  const values = { content, skillVersion: SKILL_VERSIONS.brujula, generatedAt: new Date() };
  await db()
    .insert(brandManuals)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: brandManuals.userId, set: values });
  return true;
}

/* ───────────── Resumen para Hoy / Mi marca ───────────── */

export type BrujulaOverview = {
  progress: BrujulaProgress;
  hasVoice: boolean;
  voiceIsMock: boolean;
  hasSchedule: boolean;
  scheduleAccepted: boolean;
  hasManual: boolean;
  stepsDone: number;
  stepsTotal: number;
};

export async function getOverview(userId: string): Promise<BrujulaOverview> {
  const [form, voice, schedule, manual] = await Promise.all([getBrujula(userId), getVoice(userId), getSchedule(userId), getManual(userId)]);
  const progress = brujulaProgress(form);
  const scheduleAccepted = Boolean(schedule?.acceptedAt);
  return {
    progress,
    hasVoice: Boolean(voice),
    voiceIsMock: voice?.mock ?? false,
    hasSchedule: Boolean(schedule),
    scheduleAccepted,
    hasManual: Boolean(manual),
    stepsDone: Number(progress.complete) + Number(Boolean(voice)) + Number(scheduleAccepted),
    stepsTotal: 3,
  };
}
