"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { sendToUser } from "@/lib/push";
import { endPause, setNotificationsEnabled, startPause } from "./service";

export type NotifyActionState = { error?: string; ok?: string } | undefined;

export async function startPauseAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const days = z.coerce.number().int().min(1).max(7).catch(7).parse(fd.get("dias"));
  await startPause(user.id, days);
  revalidatePath("/mi-marca");
  revalidatePath("/hoy");
  redirect("/mi-marca");
}

export async function endPauseAction(): Promise<void> {
  const { user } = await requireCreatorAccess();
  await endPause(user.id);
  revalidatePath("/mi-marca");
  revalidatePath("/hoy");
  redirect("/mi-marca");
}

export async function toggleNotificationsAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  await setNotificationsEnabled(user.id, fd.get("enabled") === "1");
  revalidatePath("/mi-marca");
  redirect("/mi-marca");
}

/** Manda una notificación de prueba a los dispositivos del usuario. */
export async function testPushAction(): Promise<NotifyActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`push-test:user:${user.id}`, 5, HOUR))) return { error: "Ya mandaste varias pruebas. Intenta más tarde." };
  const r = await sendToUser(user.id, { title: "¡Listo!", body: "Así te avisaremos de tus sesiones de grabación y tus publicaciones.", url: "/hoy", tag: "prueba" });
  return r.sent > 0 ? { ok: "Te la mandamos. Debería llegar en unos segundos." } : { error: "No encontramos un dispositivo con avisos activados." };
}
