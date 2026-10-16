"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { getClientIp } from "@/lib/request";
import { BLOCKS, blockSchema, getBlock, readBlockForm, type AnswerValue } from "./content";
import { getSchedule, rebuildManual, saveBlock, saveSchedule, saveVoice } from "./service";
import { proposeSchedule, scheduleAnswersSchema, scheduleBlockSchema, validateAdjusted, type ScheduleBlock } from "./schedule";
import { VOICE_MIN_WORDS_TEXT, VOICE_TOPIC_VALUES, wordCount } from "./voice";
import { runVoiceSkill } from "@/lib/skills";

export type BrujulaState = { error?: string; fields?: Record<string, AnswerValue>; errors?: Record<string, string> } | undefined;

/* ───────────── Formulario por bloques ───────────── */

export async function saveBlockAction(_prev: BrujulaState, fd: FormData): Promise<BrujulaState> {
  const { user } = await requireCreatorAccess();
  const blockId = String(fd.get("block") ?? "");
  const block = getBlock(blockId);
  if (!block) return { error: "Ese bloque no existe." };
  if (!(await rateLimit(`brujula:user:${user.id}`, 120, HOUR))) return { error: "Demasiados cambios seguidos. Intenta en un rato." };

  const raw = readBlockForm(block, fd);
  const parsed = blockSchema(block).safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { error: "Revisa los campos marcados.", errors, fields: raw };
  }

  const { complete } = await saveBlock(user.id, block.id, parsed.data as Record<string, AnswerValue>);
  if (complete) {
    // La skill de IA cuesta por llamada: máximo 6 regeneraciones por hora (si se pasa, se conserva el manual anterior).
    const regenerate = await rateLimit(`manual-ia:user:${user.id}`, 6, HOUR);
    await rebuildManual(user.id, { regenerateCreative: regenerate });
    await audit({ action: "brujula.completed", actorUserId: user.id, ip: await getClientIp() });
  }
  const idx = BLOCKS.findIndex((b) => b.id === block.id);
  const next = BLOCKS[idx + 1];
  redirect(next && !complete ? `/mi-marca/brujula/${next.id}` : "/mi-marca/brujula");
}

/* ───────────── Muestra de voz escrita (alternativa a grabar) ───────────── */

const voiceTextSchema = z.object({
  topic: z.enum(VOICE_TOPIC_VALUES, "Elige un tema."),
  text: z.string().trim().max(8000, "El texto es demasiado largo."),
});

export async function saveVoiceTextAction(_prev: BrujulaState, fd: FormData): Promise<BrujulaState> {
  const { user } = await requireCreatorAccess();
  const parsed = voiceTextSchema.safeParse({ topic: fd.get("topic"), text: fd.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa el texto.", fields: { text: String(fd.get("text") ?? "") } };
  const words = wordCount(parsed.data.text);
  if (words < VOICE_MIN_WORDS_TEXT) {
    return { error: `Escribe al menos ${VOICE_MIN_WORDS_TEXT} palabras, como si estuvieras hablando (llevas ${words}).`, fields: { text: parsed.data.text } };
  }
  if (!(await rateLimit(`voz:user:${user.id}`, 8, HOUR))) return { error: "Demasiados intentos. Intenta más tarde." };

  const profile = await runVoiceSkill(user.id, parsed.data.text, null);
  await saveVoice(user.id, { topic: parsed.data.topic, source: "texto", transcript: parsed.data.text, durationSeconds: null, profile, mock: false });
  await rebuildManual(user.id, { regenerateCreative: false });
  await audit({ action: "brujula.voice_saved", actorUserId: user.id, ip: await getClientIp(), meta: { source: "texto", words } });
  redirect("/mi-marca/voz?listo=1");
}

/* ───────────── Horario ───────────── */

export async function saveScheduleAnswersAction(_prev: BrujulaState, fd: FormData): Promise<BrujulaState> {
  const { user } = await requireCreatorAccess();
  const raw = {
    days: fd.getAll("days").filter((v): v is string => typeof v === "string"),
    moment: fd.get("moment"),
    duration: fd.get("duration"),
    place: fd.get("place"),
    light: fd.get("light"),
  };
  const parsed = scheduleAnswersSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa tus respuestas.", fields: { days: raw.days, moment: String(raw.moment ?? ""), duration: String(raw.duration ?? ""), place: String(raw.place ?? ""), light: String(raw.light ?? "") } };
  }
  await saveSchedule(user.id, { answers: parsed.data, proposal: proposeSchedule(parsed.data), adjusted: false, accepted: false });
  redirect("/mi-marca/horario");
}

export async function acceptScheduleAction(): Promise<void> {
  const { user } = await requireCreatorAccess();
  const current = await getSchedule(user.id);
  if (!current) redirect("/mi-marca/horario");
  await saveSchedule(user.id, { answers: current.answers, proposal: current.proposal, adjusted: current.adjusted, accepted: true });
  await rebuildManual(user.id, { regenerateCreative: false });
  await audit({ action: "brujula.schedule_saved", actorUserId: user.id, ip: await getClientIp(), meta: { adjusted: current.adjusted } });
  redirect("/mi-marca/horario?listo=1");
}

export async function adjustScheduleAction(_prev: BrujulaState, fd: FormData): Promise<BrujulaState> {
  const { user } = await requireCreatorAccess();
  const current = await getSchedule(user.id);
  if (!current) redirect("/mi-marca/horario");

  const blocks: ScheduleBlock[] = [];
  for (let i = 0; i < current.proposal.blocks.length; i++) {
    const base = current.proposal.blocks[i]!;
    const candidate = scheduleBlockSchema.safeParse({ kind: base.kind, day: fd.get(`day_${i}`), start: fd.get(`start_${i}`), minutes: base.minutes });
    if (!candidate.success) return { error: "Revisa los días y las horas." };
    blocks.push(candidate.data);
  }
  const problem = validateAdjusted(blocks);
  if (problem) return { error: problem };

  await saveSchedule(user.id, { answers: current.answers, proposal: { ...current.proposal, blocks }, adjusted: true, accepted: true });
  await rebuildManual(user.id, { regenerateCreative: false });
  await audit({ action: "brujula.schedule_saved", actorUserId: user.id, ip: await getClientIp(), meta: { adjusted: true } });
  redirect("/mi-marca/horario?listo=1");
}

