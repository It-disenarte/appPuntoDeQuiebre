"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { removeRecording } from "./service";

/** Borra una parte grabada (la pieza vuelve a "pendiente" si ya estaba completa). */
export async function deleteRecordingAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (id.success) await removeRecording(user.id, id.data);
  revalidatePath("/grabar");
  revalidatePath("/semana");
}
