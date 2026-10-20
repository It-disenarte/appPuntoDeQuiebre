"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { getClientIp } from "@/lib/request";
import { SECTION_IDS } from "@/lib/skills/schemas";
import { getStep, MAX_STEP_CHARS, quickSchema, SELL_VALUES, STORY_CHOICE_VALUES, wordCount } from "./content";
import { acceptSchedule, getIntake, intakeProgress, queueManual, saveQuick, saveScheduleAnswers, saveSell, saveStep, skipSell, voteSection } from "./service";
import { scheduleAnswersSchema, DAYS } from "./schedule";

export type BrujulaState = { error?: string; followUp?: string; fields?: Record<string, string | string[]> } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

/** Después de cada paso: al siguiente, o a las elecciones rápidas cuando ya no queda ninguno. */
async function afterStory(userId: string): Promise<never> {
  const intake = await getIntake(userId);
  const p = intakeProgress(intake);
  redirect(p.nextStep ? `/mi-marca/historia/${p.nextStep}` : "/mi-marca/historia/elecciones");
}

/* ───────────── Tu historia (7 pasos) ───────────── */

const stepFormSchema = z.object({
  text: z.string().trim().max(MAX_STEP_CHARS, "El texto es demasiado largo."),
  choice: z.enum(STORY_CHOICE_VALUES).optional(),
});

/** Respuesta escrita de un paso. Si queda corta, una sola repregunta amable (`insisted` = ya se la hicimos). */
export async function saveStepTextAction(_prev: BrujulaState, fd: FormData): Promise<BrujulaState> {
  const { user } = await requireCreatorAccess();
  const step = getStep(str(fd, "step"));
  if (!step || step.kind !== "voz") return { error: "Ese paso no existe." };
  const parsed = stepFormSchema.safeParse({ text: fd.get("text"), choice: str(fd, "choice") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa tu respuesta.", fields: { text: str(fd, "text") } };
  if (step.id === "historia" && !parsed.data.choice) return { error: "Elige primero cuál historia vas a contar.", fields: { text: parsed.data.text } };
  if (!(await rateLimit(`historia:user:${user.id}`, 80, HOUR))) return { error: "Demasiados cambios seguidos. Intenta en un rato." };

  const words = wordCount(parsed.data.text);
  if (words === 0) return { error: "Escribe algo o salta esta pregunta.", fields: { text: "" } };
  if (words < step.minWords && str(fd, "insisted") !== "1") {
    return { followUp: step.followUp, error: `Cuéntanos un poco más (llevas ${words} de ${step.minWords} palabras). ${step.followUp} Si prefieres seguir así, vuelve a pulsar Continuar.`, fields: { text: parsed.data.text } };
  }
  await saveStep(user.id, step.id, { text: parsed.data.text, source: "texto", seconds: null, mock: false }, parsed.data.choice);
  return afterStory(user.id);
}

export async function skipStepAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const step = getStep(str(fd, "step"));
  if (!step) redirect("/mi-marca/historia");
  if (step.id === "que_vendes") await skipSell(user.id);
  else await saveStep(user.id, step.id, { skipped: true });
  await afterStory(user.id);
}

export async function saveSellAction(_prev: BrujulaState, fd: FormData): Promise<BrujulaState> {
  const { user } = await requireCreatorAccess();
  const mode = z.enum(SELL_VALUES).safeParse(fd.get("mode"));
  if (!mode.success) return { error: "Elige una opción." };
  const text = str(fd, "text").trim().slice(0, 300);
  if (mode.data !== "no" && !text) return { error: "Cuéntanos en una frase qué vendes o qué te gustaría vender.", fields: { text: "", mode: mode.data } };
  await saveSell(user.id, mode.data, mode.data === "no" ? "" : text);
  return afterStory(user.id);
}

/* ───────────── Elecciones rápidas ───────────── */

export async function saveQuickAction(_prev: BrujulaState, fd: FormData): Promise<BrujulaState> {
  const { user } = await requireCreatorAccess();
  const raw = {
    redes: fd.getAll("redes").filter((v): v is string => typeof v === "string"),
    formatos: fd.getAll("formatos").filter((v): v is string => typeof v === "string"),
    tono: fd.getAll("tono").filter((v): v is string => typeof v === "string"),
    referentes: fd.getAll("referentes").filter((v): v is string => typeof v === "string"),
  };
  const parsed = quickSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa tus elecciones.", fields: raw };
  await saveQuick(user.id, parsed.data);
  // Con la historia completa, la brújula se empieza a armar sola (en segundo plano).
  if (intakeProgress((await getIntake(user.id))!).ready && (await rateLimit(`manual-ia:user:${user.id}`, 6, HOUR))) {
    await queueManual(user.id);
  }
  redirect("/mi-marca/manual");
}

/* ───────────── Manual de marca ───────────── */

export async function generateManualAction(): Promise<void> {
  const { user } = await requireCreatorAccess();
  const intake = await getIntake(user.id);
  if (!intake || !intakeProgress(intake).ready) redirect("/mi-marca/historia");
  // La skill cuesta por llamada cuando es IA real: máximo 6 por hora.
  if (!(await rateLimit(`manual-ia:user:${user.id}`, 6, HOUR))) redirect("/mi-marca/manual?limite=1");
  if ((await queueManual(user.id)) === "encolado") await audit({ action: "brujula.manual_requested", actorUserId: user.id, ip: await getClientIp() });
  redirect("/mi-marca/manual");
}

const voteSchema = z.object({
  section: z.enum(SECTION_IDS),
  vote: z.enum(["si", "ajustar", "no"]),
  note: z.string().trim().max(300),
});

export async function voteSectionAction(_prev: BrujulaState, fd: FormData): Promise<BrujulaState> {
  const { user } = await requireCreatorAccess();
  const parsed = voteSchema.safeParse({ section: fd.get("section"), vote: fd.get("vote"), note: str(fd, "note") });
  if (!parsed.success) return { error: "Revisa tu calificación." };
  const { section, vote, note } = parsed.data;
  if (vote === "ajustar" && (!note || note.length > 120)) return { error: "Escribe una nota corta (máximo 120 caracteres) con lo que quieres cambiar.", fields: { note } };
  if (vote === "no" && !note) return { error: "Cuéntanos qué no te representa para poder reescribirlo.", fields: { note } };
  if (vote !== "si" && !(await rateLimit(`manual-ajuste:user:${user.id}`, 15, HOUR))) return { error: "Demasiados ajustes seguidos. Intenta en un rato." };

  let result: Awaited<ReturnType<typeof voteSection>>;
  try {
    result = await voteSection(user.id, user.name, section, vote, note);
  } catch {
    return { error: "No pudimos aplicar tu ajuste con la IA. Intenta de nuevo en un momento.", fields: { note } };
  }
  if (!result.ok) return { error: result.error };
  if (result.approved) await audit({ action: "brujula.manual_approved", actorUserId: user.id, ip: await getClientIp() });
  revalidatePath("/mi-marca/manual");
  redirect(`/mi-marca/manual#${section}`);
}

/* ───────────── Horario ───────────── */

/** Lee las respuestas del horario: por cada día elegido, momentos, duración y "a veces no puedo". */
function readSchedule(fd: FormData) {
  const chosen = fd.getAll("dias").filter((v): v is string => typeof v === "string");
  return {
    dias: DAYS.filter((d) => chosen.includes(d.code)).map((d) => ({
      dia: d.code,
      momentos: fd.getAll(`momentos_${d.code}`).filter((v): v is string => typeof v === "string"),
      duracion_min: Number(fd.get(`duracion_${d.code}`) ?? 0),
      a_veces_no: fd.get(`aveces_${d.code}`) === "on",
    })),
    lugar: fd.getAll("lugar").filter((v): v is string => typeof v === "string"),
    luz: fd.getAll("luz").filter((v): v is string => typeof v === "string"),
  };
}

export async function saveScheduleAnswersAction(_prev: BrujulaState, fd: FormData): Promise<BrujulaState> {
  const { user } = await requireCreatorAccess();
  const parsed = scheduleAnswersSchema.safeParse(readSchedule(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa tus respuestas." };
  await saveScheduleAnswers(user.id, parsed.data);
  redirect("/mi-marca/horario");
}

export async function acceptScheduleAction(): Promise<void> {
  const { user } = await requireCreatorAccess();
  if (!(await acceptSchedule(user.id))) redirect("/mi-marca/horario");
  await audit({ action: "brujula.schedule_saved", actorUserId: user.id, ip: await getClientIp() });
  redirect("/mi-marca/horario?listo=1");
}

