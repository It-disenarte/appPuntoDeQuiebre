"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { answerDoubt, requestAdjust, requestEdit, requestRender, setSubtitle, setTitle, toggleCut } from "./service";

export type EditActionState = { error?: string; ok?: boolean } | undefined;
const uuid = z.string().uuid();
const idx = z.coerce.number().int().min(0).max(500);
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const LIMIT = "Ya usaste la edición varias veces seguidas. Intenta en una hora.";

async function guarded(fd: FormData, run: (userId: string, pieceId: string) => Promise<{ ok: true } | { ok: false; error: string }>, heavy = false): Promise<EditActionState> {
  const { user } = await requireCreatorAccess();
  const piece = uuid.safeParse(str(fd, "pieza"));
  if (!piece.success) return { error: "Video no válido." };
  if (heavy && !(await rateLimit(`edicion:user:${user.id}`, 12, HOUR))) return { error: LIMIT };
  const r = await run(user.id, piece.data);
  if (!r.ok) return { error: r.error };
  revalidatePath("/grabar");
  return { ok: true };
}

export const requestEditAction = async (_p: EditActionState, fd: FormData) => guarded(fd, (u, p) => requestEdit(u, p, str(fd, "modo") === "mixto" ? "mixto" : "a_camara"), true);
export const requestRenderAction = async (_p: EditActionState, fd: FormData) => guarded(fd, requestRender, true);
export const requestAdjustAction = async (_p: EditActionState, fd: FormData) => guarded(fd, (u, p) => requestAdjust(u, p, str(fd, "nota")), true);

/** Cambios sin IA (gratis): restaurar cortes, editar textos y contestar las dudas de la transcripción. */
export async function toggleCutAction(fd: FormData): Promise<void> {
  const i = idx.safeParse(str(fd, "i"));
  if (i.success) await guarded(fd, (u, p) => toggleCut(u, p, i.data));
}
export async function setSubtitleAction(_p: EditActionState, fd: FormData): Promise<EditActionState> {
  const i = idx.safeParse(str(fd, "i"));
  return i.success ? guarded(fd, (u, p) => setSubtitle(u, p, i.data, str(fd, "texto"))) : { error: "Línea no válida." };
}
export async function setTitleAction(_p: EditActionState, fd: FormData): Promise<EditActionState> {
  const i = idx.safeParse(str(fd, "i"));
  return i.success ? guarded(fd, (u, p) => setTitle(u, p, i.data, str(fd, "texto"))) : { error: "Texto no válido." };
}
export async function answerDoubtAction(fd: FormData): Promise<void> {
  const i = idx.safeParse(str(fd, "i"));
  const c = z.enum(["propuesta", "escuche"]).safeParse(str(fd, "eleccion"));
  if (i.success && c.success) await guarded(fd, (u, p) => answerDoubt(u, p, i.data, c.data));
}
