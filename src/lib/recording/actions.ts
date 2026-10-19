"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { requestJoin } from "./join";
import { removeRecording } from "./service";

/** Borra una parte grabada (la pieza vuelve a "pendiente" si ya estaba completa). */
export async function deleteRecordingAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (id.success) await removeRecording(user.id, id.data);
  revalidatePath("/grabar");
  revalidatePath("/semana");
}

/** “Armar mi video completo”: une las 3 partes en un solo MP4 (trabajo en segundo plano). */
export async function requestJoinAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = z.string().uuid().safeParse(fd.get("pieza"));
  if (id.success && (await rateLimit(`unir:user:${user.id}`, 20, HOUR))) await requestJoin(user.id, id.data);
  revalidatePath("/grabar");
}
