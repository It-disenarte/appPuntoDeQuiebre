"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { queueBg } from "@/lib/bg";
import { choosePart, removePhoto, saveCurrent, toggleApplied, votePart } from "./service";
import { PARTS } from "./schemas";

export type ProfileActionState = { error?: string; ok?: boolean; warning?: string } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const PAGE = "/mi-marca/perfil";
const part = z.enum(PARTS);

/** Guarda el perfil actual y genera las propuestas en un solo paso. */
export async function saveAndGenerateAction(_p: ProfileActionState, fd: FormData): Promise<ProfileActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`perfil-ia:user:${user.id}`, 12, HOUR))) return { error: "Ya generaste varias veces seguidas. Intenta en una hora." };
  const destacadas = str(fd, "destacadas").split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const s = await saveCurrent(user.id, { usuario: str(fd, "usuario").replace(/^@/, ""), nombre: str(fd, "nombre"), biografia: str(fd, "biografia"), enlace: str(fd, "enlace").trim() || null, categoria: str(fd, "categoria").trim() || null, destacadas });
  if (!s.ok) return { error: s.error };
  const q = await queueBg(user.id, "perfil", "perfil.generar");
  if (!q.ok) return { error: q.error };
  revalidatePath(PAGE);
  return { ok: true };
}

export async function refreshPartAction(_p: ProfileActionState, fd: FormData): Promise<ProfileActionState> {
  const { user } = await requireCreatorAccess();
  const p = z.enum(["nombre", "biografia"]).safeParse(str(fd, "parte"));
  if (!p.success) return { error: "Parte no válida." };
  if (!(await rateLimit(`perfil-ia:user:${user.id}`, 12, HOUR))) return { error: "Ya usaste la IA varias veces seguidas. Intenta en una hora." };
  const q = await queueBg(user.id, "perfil", "perfil.parte", { parte: p.data, nota: str(fd, "nota") });
  if (!q.ok) return { error: q.error };
  revalidatePath(PAGE);
  return { ok: true };
}

export async function choosePartAction(_p: ProfileActionState, fd: FormData): Promise<ProfileActionState> {
  const { user } = await requireCreatorAccess();
  const p = z.enum(["nombre", "biografia"]).safeParse(str(fd, "parte"));
  if (!p.success) return { error: "Parte no válida." };
  const r = await choosePart(user.id, p.data, str(fd, "texto"), str(fd, "editado") === "1");
  if (!r.ok) return { error: r.error };
  revalidatePath(PAGE);
  return { ok: true, warning: r.warning };
}

export async function votePartAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const p = part.safeParse(str(fd, "parte"));
  const voto = z.enum(["si", "no"]).safeParse(str(fd, "voto"));
  if (p.success && voto.success) await votePart(user.id, p.data, { voto: voto.data, nota: str(fd, "nota").slice(0, 300) || undefined });
  revalidatePath(PAGE);
}

export async function toggleAppliedAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const p = part.safeParse(str(fd, "parte"));
  if (p.success) await toggleApplied(user.id, p.data);
  revalidatePath(PAGE);
}

export async function removePhotoAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const key = str(fd, "key");
  if (key.startsWith(`perfil/${user.id}/`)) await removePhoto(user.id, key);
  revalidatePath(PAGE);
}
