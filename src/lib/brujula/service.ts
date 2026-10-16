import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { brandManuals, creatorIntake, kitVisual, schedules, voiceProfiles } from "@/lib/db/schema";
import { runBrujula, runPerfilVoz, SKILLS } from "@/lib/skills";
import { buildMuestraVoz, type BrujulaInput, type PerfilVozInput } from "@/lib/skills/mock";
import { brujulaV2Output, horarioV1Output, MANUAL_SECTIONS, perfilVozV1Output, SECTION_IDS, type BrujulaV2, type HorarioV1, type PerfilVozV1, type SectionId } from "@/lib/skills/schemas";
import { INTAKE_VERSION, quickSchema, storyProgress, storySchema, STORY_STEPS, type Quick, type Story, type StepAnswer, type StepId, type StoryChoice, type SellMode } from "./content";
import { buildSchedule, scheduleAnswersSchema, type ScheduleAnswers } from "./schedule";


/* ───────────── Alta: Tu historia y elecciones rápidas ───────────── */

export type Intake = { story: Story; quick: Quick | null; completedAt: Date | null };

export async function getIntake(userId: string): Promise<Intake | null> {
  const [row] = await db().select().from(creatorIntake).where(eq(creatorIntake.userId, userId)).limit(1);
  if (!row) return null;
  const story = storySchema.safeParse(row.story);
  const quick = row.quick ? quickSchema.safeParse(row.quick) : null;
  return { story: story.success ? (story.data as Story) : { steps: {} }, quick: quick?.success ? quick.data : null, completedAt: row.completedAt };
}

/** Lee-modifica-escribe dentro de una transacción con candado de fila (dos pestañas no se pisan). */
async function mutateIntake(userId: string, fn: (story: Story, quick: Quick | null) => { story: Story; quick?: Quick | null }) {
  await db().transaction(async (tx) => {
    await tx.insert(creatorIntake).values({ userId, contentVersion: INTAKE_VERSION }).onConflictDoNothing();
    const [row] = await tx.select().from(creatorIntake).where(eq(creatorIntake.userId, userId)).for("update").limit(1);
    const storyParsed = storySchema.safeParse(row!.story);
    const quickParsed = row!.quick ? quickSchema.safeParse(row!.quick) : null;
    const next = fn(storyParsed.success ? (storyParsed.data as Story) : { steps: {} }, quickParsed?.success ? quickParsed.data : null);
    await tx
      .update(creatorIntake)
      .set({ story: next.story, ...(next.quick !== undefined ? { quick: next.quick } : {}), contentVersion: INTAKE_VERSION })
      .where(eq(creatorIntake.userId, userId));
  });
}

export const saveStep = (userId: string, id: StepId, answer: StepAnswer, storyChoice?: StoryChoice) =>
  mutateIntake(userId, (story) => ({ story: { ...story, steps: { ...story.steps, [id]: answer }, ...(storyChoice ? { storyChoice } : {}) } }));

export const saveSell = (userId: string, mode: SellMode, text: string) =>
  mutateIntake(userId, (story) => {
    const steps = { ...story.steps };
    delete steps.que_vendes;
    return { story: { ...story, steps, sell: { mode, text } } };
  });

export const skipSell = (userId: string) => mutateIntake(userId, (story) => ({ story: { ...story, sell: undefined, steps: { ...story.steps, que_vendes: { skipped: true } } } }));

export const saveQuick = (userId: string, quick: Quick) => mutateIntake(userId, (story) => ({ story, quick }));

export type IntakeProgress = ReturnType<typeof storyProgress> & { quickDone: boolean; ready: boolean };

export function intakeProgress(intake: Intake | null): IntakeProgress {
  const p = storyProgress(intake?.story ?? null);
  const quickDone = Boolean(intake?.quick);
  return { ...p, quickDone, ready: p.complete && quickDone };
}

/* ───────────── Manual de marca (brujula-v2) ───────────── */

const votesSchema = z.record(z.string(), z.object({ voto: z.enum(["si", "pendiente"]), nota: z.string(), ajustes: z.number().int() }));
export type Votes = z.infer<typeof votesSchema>;
export const MAX_ADJUSTMENTS = 3;

export type Manual = { content: BrujulaV2; votes: Votes; status: "borrador" | "aprobado"; mock: boolean; approvedAt: Date | null; generatedAt: Date };

export async function getManual(userId: string): Promise<Manual | null> {
  const [row] = await db().select().from(brandManuals).where(eq(brandManuals.userId, userId)).limit(1);
  if (!row) return null;
  const content = brujulaV2Output.safeParse(row.content);
  const votes = votesSchema.safeParse(row.votes);
  if (!content.success) return null;
  return { content: content.data, votes: votes.success ? votes.data : {}, status: row.status, mock: row.mock, approvedAt: row.approvedAt, generatedAt: row.generatedAt };
}

function brujulaInput(userId: string, name: string, intake: Intake): BrujulaInput {
  return {
    creador_id: userId,
    nombre: name,
    auditoria: { modo: "sin_contenido" },
    respuestas_tarjetas: [],
    muestra_voz: buildMuestraVoz(intake.story),
    elecciones_rapidas: intake.quick!,
    kit_visual: null,
  };
}

/** Segundos totales solo si TODA la muestra fue por audio (si no, el ritmo no es comparable). */
function audioSeconds(story: Story): number | null {
  const answered = STORY_STEPS.filter((s) => s.kind === "voz").map((s) => story.steps[s.id]).filter((a): a is Extract<StepAnswer, { text: string }> => Boolean(a) && !("skipped" in (a as object) && (a as { skipped?: boolean }).skipped));
  if (!answered.length || answered.some((a) => a.source !== "audio" || !a.seconds)) return null;
  return answered.reduce((s, a) => s + (a.seconds ?? 0), 0);
}

/** Genera (o rehace) el manual y el perfil de voz con lo que respondió el creador. Reinicia la calificación. */
export async function generateManual(userId: string, name: string): Promise<boolean> {
  const intake = await getIntake(userId);
  if (!intake || !intakeProgress(intake).ready) return false;

  const brujula = await runBrujula(userId, brujulaInput(userId, name, intake));
  const manualValues = { content: brujula.output, votes: {}, status: "borrador" as const, mock: brujula.mock, skillVersion: brujula.skillVersion, approvedAt: null, generatedAt: new Date() };
  await db()
    .insert(brandManuals)
    .values({ userId, ...manualValues })
    .onConflictDoUpdate({ target: brandManuals.userId, set: manualValues });

  const profile = await runPerfilVoz(
    userId,
    { creador_id: userId, muestra_voz: buildMuestraVoz(intake.story), brujula: { tono: brujula.output.tono, palabras_si: brujula.output.palabras_si, palabras_no: brujula.output.palabras_no } } satisfies PerfilVozInput,
    audioSeconds(intake.story),
  );
  const profileValues = { content: profile.output, mock: profile.mock, skillVersion: profile.skillVersion };
  await db()
    .insert(voiceProfiles)
    .values({ userId, ...profileValues })
    .onConflictDoUpdate({ target: voiceProfiles.userId, set: { ...profileValues, updatedAt: new Date() } });

  await db().update(creatorIntake).set({ completedAt: new Date() }).where(eq(creatorIntake.userId, userId));
  return true;
}

export type VoteResult = { ok: true; approved: boolean } | { ok: false; error: string };

/**
 * Calificación de una sección del manual (regla 14 de la skill): 👍 la aprueba; ✏️ (nota corta) o 👎 (nota obligatoria)
 * piden un cambio: la skill ajusta solo esa sección y el creador vuelve a calificar. Máximo 3 ajustes por sección.
 */
export async function voteSection(userId: string, name: string, section: SectionId, voto: "si" | "ajustar" | "no", nota: string): Promise<VoteResult> {
  const manual = await getManual(userId);
  if (!manual) return { ok: false, error: "Todavía no tienes un manual." };
  if (!SECTION_IDS.includes(section)) return { ok: false, error: "Esa sección no existe." };
  const current = manual.votes[section] ?? { voto: "pendiente" as const, nota: "", ajustes: 0 };

  let content = manual.content;
  let mock = manual.mock;
  let next: Votes[string];
  if (voto === "si") {
    next = { voto: "si", nota: "", ajustes: current.ajustes };
  } else {
    if (current.ajustes >= MAX_ADJUSTMENTS) return { ok: false, error: "Ya usaste los 3 ajustes de esta sección. Aprueba esta versión o escríbenos." };
    const intake = await getIntake(userId);
    if (!intake || !intake.quick) return { ok: false, error: "Falta completar tu alta." };
    const result = await runBrujula(userId, { ...brujulaInput(userId, name, intake), ajuste: { seccion: section, voto, nota, manual_actual: manual.content } });
    content = result.output;
    mock = mock && result.mock;
    next = { voto: "pendiente", nota, ajustes: current.ajustes + 1 };
  }

  const votes = { ...manual.votes, [section]: next };
  const approved = SECTION_IDS.every((id) => votes[id]?.voto === "si");
  await db()
    .update(brandManuals)
    .set({ content, votes, mock, status: approved ? "aprobado" : "borrador", approvedAt: approved ? (manual.approvedAt ?? new Date()) : null })
    .where(eq(brandManuals.userId, userId));
  return { ok: true, approved };
}

/* ───────────── Perfil de voz ───────────── */

export async function getVoiceProfile(userId: string): Promise<{ content: PerfilVozV1; mock: boolean } | null> {
  const [row] = await db().select().from(voiceProfiles).where(eq(voiceProfiles.userId, userId)).limit(1);
  if (!row) return null;
  const content = perfilVozV1Output.safeParse(row.content);
  return content.success ? { content: content.data, mock: row.mock } : null;
}

/* ───────────── Horario ───────────── */

export async function getSchedule(userId: string): Promise<{ answers: ScheduleAnswers; result: HorarioV1; acceptedAt: Date | null } | null> {
  const [row] = await db().select().from(schedules).where(eq(schedules.userId, userId)).limit(1);
  if (!row) return null;
  const answers = scheduleAnswersSchema.safeParse(row.answers);
  const result = horarioV1Output.safeParse(row.result);
  return answers.success && result.success ? { answers: answers.data, result: result.data, acceptedAt: row.acceptedAt } : null;
}

export async function saveScheduleAnswers(userId: string, answers: ScheduleAnswers, mejorHoraPublicar: string | null = null) {
  const values = { answers, result: buildSchedule(answers, { mejorHoraPublicar }), acceptedAt: null };
  await db()
    .insert(schedules)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: schedules.userId, set: { ...values, updatedAt: new Date() } });
}

export async function acceptSchedule(userId: string): Promise<boolean> {
  const rows = await db().update(schedules).set({ acceptedAt: new Date() }).where(eq(schedules.userId, userId)).returning({ id: schedules.userId });
  return rows.length > 0;
}

/* ───────────── Resumen para Hoy / Mi marca ───────────── */

export type BrujulaOverview = {
  story: ReturnType<typeof storyProgress> & { quickDone: boolean; ready: boolean };
  hasManual: boolean;
  manualApproved: boolean;
  manualMock: boolean;
  sectionsApproved: number;
  hasVoiceProfile: boolean;
  hasSchedule: boolean;
  scheduleAccepted: boolean;
  kitApproved: boolean;
  stepsDone: number;
  stepsTotal: number;
  /** Siguiente paso recomendado (o null si todo está listo). */
  next: { href: string; text: string } | null;
};

export async function getOverview(userId: string): Promise<BrujulaOverview> {
  const [intake, manual, voice, schedule, kit] = await Promise.all([
    getIntake(userId),
    getManual(userId),
    getVoiceProfile(userId),
    getSchedule(userId),
    db().select({ approvedAt: kitVisual.approvedAt }).from(kitVisual).where(eq(kitVisual.userId, userId)).limit(1),
  ]);
  const kitApproved = Boolean(kit[0]?.approvedAt);
  const story = intakeProgress(intake);
  const scheduleAccepted = Boolean(schedule?.acceptedAt);
  const manualApproved = manual?.status === "aprobado";
  const sectionsApproved = manual ? MANUAL_SECTIONS.filter((s) => manual.votes[s.id]?.voto === "si").length : 0;
  const stepsDone = Number(story.ready) + Number(manualApproved) + Number(kitApproved) + Number(scheduleAccepted);

  let next: BrujulaOverview["next"] = null;
  if (!story.complete) next = { href: story.nextStep ? `/mi-marca/historia/${story.nextStep}` : "/mi-marca/historia", text: story.done === 0 ? "Empieza tu historia" : "Continúa tu historia" };
  else if (!story.quickDone) next = { href: "/mi-marca/historia/elecciones", text: "Haz tus elecciones rápidas" };
  else if (!manual) next = { href: "/mi-marca/manual", text: "Genera tu brújula" };
  else if (!manualApproved) next = { href: "/mi-marca/manual", text: "Revisa tu brújula" };
  else if (!kitApproved) next = { href: "/mi-marca/kit", text: "Arma tu kit visual" };
  else if (!scheduleAccepted) next = { href: "/mi-marca/horario", text: "Define tu horario de grabación" };

  return {
    story,
    hasManual: Boolean(manual),
    manualApproved,
    manualMock: manual?.mock ?? false,
    sectionsApproved,
    hasVoiceProfile: Boolean(voice),
    hasSchedule: Boolean(schedule),
    scheduleAccepted,
    kitApproved,
    stepsDone,
    stepsTotal: 4,
    next,
  };
}

export { SKILLS };
