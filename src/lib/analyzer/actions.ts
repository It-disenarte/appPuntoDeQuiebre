"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { addCompetitor, removeCompetitor, startRun, toggleStar } from "./service";

export type AnalyzerActionState = { error?: string } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const UUID = /^[0-9a-f-]{36}$/i;

export async function addCompetitorAction(_prev: AnalyzerActionState, fd: FormData): Promise<AnalyzerActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`analizador-cuenta:user:${user.id}`, 20, HOUR))) return { error: "Demasiados cambios seguidos. Intenta en un rato." };
  const r = await addCompetitor(user.id, str(fd, "usuario"));
  if (!r.ok) return { error: r.error };
  revalidatePath("/analizador");
  return undefined;
}

export async function removeCompetitorAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = str(fd, "id");
  if (UUID.test(id)) await removeCompetitor(user.id, id);
  revalidatePath("/analizador");
}

export async function startRunAction(): Promise<AnalyzerActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`analizador-correr:user:${user.id}`, 5, 24 * HOUR))) return { error: "Ya lo intentaste varias veces hoy." };
  const r = await startRun(user.id);
  if (!r.ok) return { error: r.error };
  revalidatePath("/analizador");
  redirect("/analizador");
}

export async function toggleStarAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = str(fd, "id");
  if (UUID.test(id)) await toggleStar(user.id, id);
  revalidatePath("/analizador");
}
