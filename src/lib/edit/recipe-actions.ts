"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { moveClip, removeClip, requestRecipe, requestRecipeAdjust } from "./recipe";

export type RecipeActionState = { error?: string; ok?: boolean } | undefined;
const uuid = z.string().uuid();
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

async function guarded(fd: FormData, run: (userId: string, pieceId: string) => Promise<{ ok: true } | { ok: false; error: string }>): Promise<RecipeActionState> {
  const { user } = await requireCreatorAccess();
  const piece = uuid.safeParse(str(fd, "pieza"));
  if (!piece.success) return { error: "Video no válido." };
  if (!(await rateLimit(`receta:user:${user.id}`, 12, HOUR))) return { error: "Ya la pediste varias veces seguidas. Intenta en una hora." };
  const r = await run(user.id, piece.data);
  if (!r.ok) return { error: r.error };
  revalidatePath("/grabar");
  return { ok: true };
}

export const requestRecipeAction = async (_p: RecipeActionState, fd: FormData) => guarded(fd, requestRecipe);
export const requestRecipeAdjustAction = async (_p: RecipeActionState, fd: FormData) => guarded(fd, (u, p) => requestRecipeAdjust(u, p, str(fd, "nota")));

export async function removeClipAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = uuid.safeParse(str(fd, "id"));
  if (id.success) await removeClip(user.id, id.data);
  revalidatePath("/grabar");
}
export async function moveClipAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = uuid.safeParse(str(fd, "id"));
  if (id.success) await moveClip(user.id, id.data, str(fd, "dir") === "up" ? "up" : "down");
  revalidatePath("/grabar");
}
