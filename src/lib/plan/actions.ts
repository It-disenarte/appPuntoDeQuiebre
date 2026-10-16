"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { getClientIp } from "@/lib/request";
import { addDays, mondayOf, targetWeek, todayIso } from "./rules";
import { generatePlan, generateTexts, reviewTexts, setPieceStatus, updateStory } from "./service";

export type PlanActionState = { error?: string; ok?: boolean } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const uuid = z.string().uuid();

/** "Generar mi semana": incluye el enfoque de las historias (tarjeta 1C: de 1 a 3 temas y tipos que no quiere ver). */
export async function generatePlanAction(_prev: PlanActionState, fd: FormData): Promise<PlanActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`plan-ia:user:${user.id}`, 6, HOUR))) return { error: "Ya generaste varias veces seguidas. Intenta de nuevo en una hora." };
  const temas = [...fd.getAll("temas"), str(fd, "otro")]
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 3);
  // La semana pedida debe ser un lunes cercano (de la semana pasada a dos semanas adelante).
  const requested = str(fd, "week");
  const today = todayIso();
  const week = /^\d{4}-\d{2}-\d{2}$/.test(requested) && mondayOf(requested) === requested && requested >= addDays(mondayOf(today), -7) && requested <= addDays(mondayOf(today), 14) ? requested : targetWeek();
  const hasta = addDays(week, 28);
  const tipos_apagados = fd.getAll("apagar").filter((t): t is string => typeof t === "string").slice(0, 8).map((tipo) => ({ tipo, hasta }));
  try {
    const r = await generatePlan(user.id, { weekStart: week, focus: { temas, tipos_apagados } });
    if (!r.ok) return { error: r.error };
    await audit({ action: "plan.generated", actorUserId: user.id, ip: await getClientIp(), meta: { semana: r.weekStart } });
  } catch {
    return { error: "No pudimos armar tu semana con la IA. Tus datos están a salvo: intenta de nuevo en un momento." };
  }
  revalidatePath("/semana");
  redirect("/semana");
}

export async function generateTextsAction(_prev: PlanActionState, fd: FormData): Promise<PlanActionState> {
  const { user } = await requireCreatorAccess();
  const id = uuid.safeParse(str(fd, "id"));
  if (!id.success) return { error: "Pieza no válida." };
  if (!(await rateLimit(`textos-ia:user:${user.id}`, 40, HOUR))) return { error: "Demasiados textos seguidos. Intenta en un rato." };
  try {
    const r = await generateTexts(user.id, id.data);
    if (!r.ok) return { error: r.error };
  } catch {
    return { error: "No pudimos escribir los textos con la IA. Intenta de nuevo en un momento." };
  }
  revalidatePath(`/semana/${id.data}`);
  return { ok: true };
}

const reviewSchema = z.object({
  id: uuid,
  gancho: z.coerce.number().int().min(0).max(4).optional(),
  network: z.enum(["instagram", "tiktok", "facebook"]).optional(),
  voto: z.enum(["si", "editado", "no"]).optional(),
});

/** Elegir gancho, 👍 / ✏️ / 👎 por red y guardar el texto editado. Copiar sin editar cuenta como 👍. */
export async function reviewTextsAction(_prev: PlanActionState, fd: FormData): Promise<PlanActionState> {
  const { user } = await requireCreatorAccess();
  const p = reviewSchema.safeParse({ id: str(fd, "id"), gancho: str(fd, "gancho") || undefined, network: str(fd, "network") || undefined, voto: str(fd, "voto") || undefined });
  if (!p.success) return { error: "Revisa tu calificación." };
  const edited = fd.has("edited") ? str(fd, "edited") : undefined;
  const ok = await reviewTexts(user.id, p.data.id, { gancho: p.data.gancho, network: p.data.network, voto: p.data.voto, edited });
  if (!ok) return { error: "No encontramos esos textos." };
  revalidatePath(`/semana/${p.data.id}`);
  return { ok: true };
}

export async function setStatusAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = uuid.safeParse(str(fd, "id"));
  const status = z.enum(["pendiente", "grabado", "descartado"]).safeParse(str(fd, "status"));
  if (id.success && status.success) await setPieceStatus(user.id, id.data, status.data);
  revalidatePath("/semana");
  redirect(`/semana/${id.success ? id.data : ""}`);
}

const storySchema = z.object({ id: uuid, op: z.enum(["otra", "voto", "editar", "propia", "hecha"]) });

export async function storyAction(_prev: PlanActionState, fd: FormData): Promise<PlanActionState> {
  const { user } = await requireCreatorAccess();
  const p = storySchema.safeParse({ id: str(fd, "id"), op: str(fd, "op") });
  if (!p.success) return { error: "Acción no válida." };
  const change =
    p.data.op === "otra"
      ? { next: true }
      : p.data.op === "voto"
        ? { vote: z.enum(["no", "mas_o_menos", "si"]).catch("si").parse(str(fd, "voto")) }
        : p.data.op === "editar"
          ? { edited: str(fd, "texto") }
          : p.data.op === "propia"
            ? { own: str(fd, "texto") }
            : { done: str(fd, "hecha") !== "0" };
  const r = await updateStory(user.id, p.data.id, change);
  if (!r.ok) return { error: r.error };
  revalidatePath("/semana");
  revalidatePath("/hoy");
  return { ok: true };
}
