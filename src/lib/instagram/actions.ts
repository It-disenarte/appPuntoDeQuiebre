"use server";

import { revalidatePath } from "next/cache";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { disconnect, syncConnection } from "./service";

export type IgActionState = { error?: string; ok?: boolean } | undefined;

export async function syncAction(): Promise<IgActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`ig-sync:user:${user.id}`, 6, HOUR))) return { error: "Actualizaste varias veces seguidas. Intenta en un rato." };
  const r = await syncConnection(user.id);
  revalidatePath("/mi-marca/instagram");
  return r.ok ? { ok: true } : { error: r.error };
}

export async function disconnectAction(): Promise<void> {
  const { user } = await requireCreatorAccess();
  await disconnect(user.id);
  revalidatePath("/mi-marca/instagram");
}
