"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { addDays, mondayOf, targetWeek, todayIso } from "@/lib/plan/rules";
import { queueBg } from "@/lib/bg";
import { dismissNotice, markDone, resetNotice, resetSituation } from "./service";

export type LiveActionState = { error?: string; ok?: boolean } | undefined;
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const PAGE = "/directos";
const AI_LIMIT = "Ya usaste la IA varias veces seguidas. Intenta de nuevo en una hora.";

export async function saveAnswersAction(_p: LiveActionState, fd: FormData): Promise<LiveActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`directos-ia:user:${user.id}`, 20, HOUR))) return { error: AI_LIMIT };
  const q = await queueBg(user.id, "directos", "directos.respuestas", {
    answers: {
      situacion: str(fd, "situacion"),
      plataformas: fd.getAll("plataformas").filter((v): v is string => typeof v === "string"),
      dias: fd.getAll("dias").filter((v): v is string => typeof v === "string"),
      hora: str(fd, "hora") || null,
      frecuencia: str(fd, "frecuencia").trim() || null,
      compromiso: str(fd, "compromiso").trim() || null,
    },
  });
  if (!q.ok) return { error: q.error };
  revalidatePath(PAGE);
  return { ok: true };
}

export async function generateWeekAction(_p: LiveActionState, fd: FormData): Promise<LiveActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`directos-ia:user:${user.id}`, 20, HOUR))) return { error: AI_LIMIT };
  const requested = str(fd, "week");
  const today = todayIso();
  const week = /^\d{4}-\d{2}-\d{2}$/.test(requested) && mondayOf(requested) === requested && requested >= addDays(mondayOf(today), -7) && requested <= addDays(mondayOf(today), 14) ? requested : targetWeek();
  const q = await queueBg(user.id, "directos", "directos.semana", { week });
  if (!q.ok) return { error: q.error };
  revalidatePath(PAGE);
  return { ok: true };
}

export async function requestSupportAction(_p: LiveActionState, fd: FormData): Promise<LiveActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`directos-ia:user:${user.id}`, 20, HOUR))) return { error: AI_LIMIT };
  const q = await queueBg(user.id, "directos", "directos.apoyo", { tema: str(fd, "tema") });
  if (!q.ok) return { error: q.error };
  revalidatePath(PAGE);
  return { ok: true };
}

export async function markDoneAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = z.string().uuid().safeParse(str(fd, "guia"));
  if (id.success) await markDone(user.id, id.data, str(fd, "dia"));
  revalidatePath(PAGE);
}
export async function changeAnswerAction(): Promise<void> {
  const { user } = await requireCreatorAccess();
  await resetSituation(user.id);
  revalidatePath(PAGE);
}
export async function dismissNoticeAction(): Promise<void> {
  const { user } = await requireCreatorAccess();
  await dismissNotice(user.id);
  revalidatePath(PAGE);
}
export async function enableNoticeAction(): Promise<void> {
  const { user } = await requireCreatorAccess();
  await resetNotice(user.id);
  revalidatePath(PAGE);
}
