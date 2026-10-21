"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { queueBg } from "@/lib/bg";
import { markTrendUsed, weeklyQuota } from "./service";

export type TrendActionState = { error?: string; ok?: boolean } | undefined;
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const uuid = z.string().uuid();
const AI_LIMIT = "Ya usaste la IA varias veces seguidas. Intenta de nuevo en una hora.";

export async function requestUseAction(): Promise<TrendActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`tendencias-ia:user:${user.id}`, 20, HOUR))) return { error: AI_LIMIT };
  const quota = await weeklyQuota(user.id);
  if (quota.used >= quota.limit) return { error: "Ya usaste tus consultas de esta semana." };
  const q = await queueBg(user.id, "tendencias", "tendencias.pedir");
  if (!q.ok) return { error: q.error };
  revalidatePath("/tendencias");
  redirect("/tendencias");
}

export async function refreshUseAction(_p: TrendActionState, fd: FormData): Promise<TrendActionState> {
  const { user } = await requireCreatorAccess();
  if (!uuid.safeParse(str(fd, "uso")).success) return { error: "Consulta no válida." };
  if (!(await rateLimit(`tendencias-ia:user:${user.id}`, 20, HOUR))) return { error: AI_LIMIT };
  const q = await queueBg(user.id, "tendencias", "tendencias.otras", { uso: str(fd, "uso"), nota: str(fd, "nota") });
  if (!q.ok) return { error: q.error };
  revalidatePath("/tendencias");
  return { ok: true };
}

export async function chooseTrendAction(_p: TrendActionState, fd: FormData): Promise<TrendActionState> {
  const { user } = await requireCreatorAccess();
  if (!uuid.safeParse(str(fd, "uso")).success) return { error: "Consulta no válida." };
  if (!(await rateLimit(`tendencias-ia:user:${user.id}`, 20, HOUR))) return { error: AI_LIMIT };
  const q = await queueBg(user.id, "tendencias", "tendencias.elegir", { uso: str(fd, "uso"), tendencia: str(fd, "tendencia") });
  if (!q.ok) return { error: q.error };
  revalidatePath("/tendencias");
  return { ok: true };
}

/** “Voy a usar esta”: se marca como usada y se manda al siguiente paso. */
export async function useTrendAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  await markTrendUsed(user.id, str(fd, "tendencia"));
  revalidatePath("/tendencias");
  const next = str(fd, "paso");
  redirect(next === "skill_8" ? "/carruseles" : next === "skill_7" ? "/hoy" : "/semana");
}
