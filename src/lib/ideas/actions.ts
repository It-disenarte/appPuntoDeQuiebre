"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { removeIdea, saveIdea } from "./bank";
import { queueVideoFromIdea } from "./service";

export type IdeaActionState = { ok?: boolean; error?: string; message?: string } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const fields = (fd: FormData) => ({ title: str(fd, "titulo"), hook: str(fd, "gancho"), idea: str(fd, "idea"), shortScript: str(fd, "guion") || null, creator: str(fd, "creador").replace(/^@/, "") || null });

/** “Guardar en mi banco”: la idea queda para usarla después o para que la tome la parrilla de la próxima semana. */
export async function saveIdeaAction(_prev: IdeaActionState, fd: FormData): Promise<IdeaActionState> {
  const { user } = await requireCreatorAccess();
  const r = await saveIdea(user.id, fields(fd));
  if (!r.ok) return { error: r.error };
  revalidatePath("/analizador");
  return { ok: true, message: r.already ? "Ya estaba en tu banco." : "Guardada en tu banco. La tomaremos en cuenta al armar tu próxima semana." };
}

/** “Hacer un video con esta idea”: se guarda (si no estaba) y el worker escribe el guion y lo agrega a la semana. */
export async function videoFromIdeaAction(_prev: IdeaActionState, fd: FormData): Promise<IdeaActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`idea-video:user:${user.id}`, 10, HOUR))) return { error: "Ya pediste varios guiones seguidos. Intenta en una hora." };
  const id = z.string().uuid().safeParse(str(fd, "ideaId"));
  let ideaId = id.success ? id.data : "";
  if (!ideaId) {
    const saved = await saveIdea(user.id, fields(fd));
    if (!saved.ok) return { error: saved.error };
    ideaId = saved.id;
  }
  const r = await queueVideoFromIdea(user.id, ideaId);
  if (!r.ok) return { error: r.error };
  revalidatePath("/analizador");
  return { ok: true, message: "Estamos escribiendo el guion con tu voz. Te avisamos cuando esté en tu semana." };
}

export async function removeIdeaAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = z.string().uuid().safeParse(str(fd, "id"));
  if (id.success) await removeIdea(user.id, id.data);
  revalidatePath("/analizador");
}
