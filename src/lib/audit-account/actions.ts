"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { queueBg } from "@/lib/bg";
import { voteCard } from "./service";

export type AuditActionState = { error?: string; ok?: boolean } | undefined;

export async function runAuditAction(): Promise<AuditActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`auditoria:user:${user.id}`, 4, HOUR))) return { error: "Ya la corriste varias veces. Intenta en una hora." };
  const q = await queueBg(user.id, "auditoria", "auditoria");
  if (!q.ok) return { error: q.error };
  revalidatePath("/mi-marca/auditoria");
  return { ok: true };
}

export async function voteCardAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = z.string().regex(/^[\w-]{1,20}$/).safeParse(fd.get("tarjeta"));
  const voto = z.enum(["si", "no", "ajustar"]).safeParse(fd.get("voto"));
  const nota = typeof fd.get("nota") === "string" ? String(fd.get("nota")).slice(0, 300) : undefined;
  if (id.success && voto.success) await voteCard(user.id, id.data, { voto: voto.data, nota: nota || undefined });
  revalidatePath("/mi-marca/auditoria");
}
