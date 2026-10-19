"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { chooseTrend, markTrendUsed, refreshUse, requestUse } from "./service";

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
  try {
    const r = await requestUse(user.id);
    if (!r.ok) return { error: r.error };
  } catch {
    return { error: "La IA no respondió. Intenta de nuevo en un momento." };
  }
  revalidatePath("/tendencias");
  redirect("/tendencias");
}

export async function refreshUseAction(_p: TrendActionState, fd: FormData): Promise<TrendActionState> {
  const { user } = await requireCreatorAccess();
  if (!uuid.safeParse(str(fd, "uso")).success) return { error: "Consulta no válida." };
  if (!(await rateLimit(`tendencias-ia:user:${user.id}`, 20, HOUR))) return { error: AI_LIMIT };
  try {
    const r = await refreshUse(user.id, str(fd, "uso"), str(fd, "nota"));
    if (!r.ok) return { error: r.error };
  } catch {
    return { error: "La IA no respondió. Intenta de nuevo en un momento." };
  }
  revalidatePath("/tendencias");
  return { ok: true };
}

export async function chooseTrendAction(_p: TrendActionState, fd: FormData): Promise<TrendActionState> {
  const { user } = await requireCreatorAccess();
  if (!uuid.safeParse(str(fd, "uso")).success) return { error: "Consulta no válida." };
  if (!(await rateLimit(`tendencias-ia:user:${user.id}`, 20, HOUR))) return { error: AI_LIMIT };
  try {
    const r = await chooseTrend(user.id, str(fd, "uso"), str(fd, "tendencia"));
    if (!r.ok) return { error: r.error };
  } catch {
    return { error: "La IA no respondió. Intenta de nuevo en un momento." };
  }
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
