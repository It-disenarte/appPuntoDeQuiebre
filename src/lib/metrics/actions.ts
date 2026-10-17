"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { KEY_FIELDS } from "./schemas";
import { confirmReport, isValidPeriod, removeShot, resetReport, submitReport } from "./service";

export type MetricsActionState = { error?: string } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const back = (period: string) => `/progreso/metricas?mes=${period}`;

export async function submitReportAction(_prev: MetricsActionState, fd: FormData): Promise<MetricsActionState> {
  const { user } = await requireCreatorAccess();
  const period = str(fd, "periodo");
  if (!isValidPeriod(period)) return { error: "Ese mes no se puede reportar." };
  if (!(await rateLimit(`metricas-leer:user:${user.id}`, 6, HOUR))) return { error: "Ya mandaste varias veces. Intenta en un rato." };
  const r = await submitReport(user.id, period);
  if (!r.ok) return { error: r.error };
  revalidatePath("/progreso/metricas");
  redirect(back(period));
}

export async function removeShotAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const period = str(fd, "periodo");
  const i = z.coerce.number().int().min(0).max(20).safeParse(str(fd, "i"));
  if (isValidPeriod(period) && i.success) await removeShot(user.id, period, i.data);
  revalidatePath("/progreso/metricas");
  redirect(back(period));
}

/** El creador confirma o corrige las cifras que leímos; después se explican. */
export async function confirmReportAction(_prev: MetricsActionState, fd: FormData): Promise<MetricsActionState> {
  const { user } = await requireCreatorAccess();
  const period = str(fd, "periodo");
  if (!isValidPeriod(period)) return { error: "Ese mes no se puede reportar." };
  if (!(await rateLimit(`metricas-explicar:user:${user.id}`, 6, HOUR))) return { error: "Ya generaste varios informes seguidos. Intenta en un rato." };
  const edits: Record<string, number | null> = {};
  for (const f of KEY_FIELDS) {
    const raw = str(fd, f.id).trim().replace(/[\s,]/g, "");
    if (raw === "") edits[f.id] = null;
    else if (/^\d{1,10}(\.\d{1,2})?$/.test(raw)) edits[f.id] = Number(raw);
    else return { error: `“${f.label}” debe ser un número.` };
  }
  try {
    const r = await confirmReport(user.id, period, edits);
    if (!r.ok) return { error: r.error };
  } catch {
    return { error: "No pudimos armar tu informe. Intenta de nuevo en un momento." };
  }
  revalidatePath("/progreso");
  revalidatePath("/progreso/metricas");
  redirect(back(period));
}

export async function resetReportAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const period = str(fd, "periodo");
  if (isValidPeriod(period)) await resetReport(user.id, period);
  revalidatePath("/progreso");
  revalidatePath("/progreso/metricas");
  redirect(back(period));
}
