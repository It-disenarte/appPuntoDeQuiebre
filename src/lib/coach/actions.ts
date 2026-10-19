"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { declineReview, requestReview, voteImprovement } from "./service";

const uuid = z.string().uuid();
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
export type CoachActionState = { error?: string; ok?: boolean } | undefined;

export async function requestReviewAction(_p: CoachActionState, fd: FormData): Promise<CoachActionState> {
  const { user } = await requireCreatorAccess();
  const id = uuid.safeParse(str(fd, "pieza"));
  if (!id.success) return { error: "Video no válido." };
  if (!(await rateLimit(`coach:user:${user.id}`, 10, HOUR))) return { error: "Demasiadas solicitudes seguidas. Intenta en un rato." };
  const r = await requestReview(user.id, id.data);
  if (!r.ok) return { error: r.error };
  revalidatePath("/grabar");
  return { ok: true };
}

export async function declineReviewAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = uuid.safeParse(str(fd, "pieza"));
  if (id.success) await declineReview(user.id, id.data);
  revalidatePath("/grabar");
}

export async function voteImprovementAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = uuid.safeParse(str(fd, "review"));
  const i = z.coerce.number().int().min(0).max(5).safeParse(str(fd, "i"));
  const voto = z.enum(["si", "no"]).safeParse(str(fd, "voto"));
  if (id.success && i.success && voto.success) await voteImprovement(user.id, id.data, i.data, { voto: voto.data, nota: str(fd, "nota").slice(0, 300) || undefined });
  revalidatePath("/grabar");
}
