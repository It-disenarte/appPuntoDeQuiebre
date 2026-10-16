"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { getClientIp } from "@/lib/request";
import { PIECE_IDS, VOTE_REASONS, type PieceId } from "./schemas";
import { stageUrl } from "./stage";
import { chooseElements, chooseManual, chooseOptions, deletePhoto, ensureRound, fillDefaults, getKit, kitStage, refreshRound, resetKit, startReveal, submitVotes, type VoteInput } from "./service";

export type KitActionState = { error?: string } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const round = (fd: FormData) => z.coerce.number().int().min(1).max(4).parse(fd.get("ronda")) as 1 | 2 | 3 | 4;

/** Va a lo que sigue; si es una ronda con IA todavía sin generar, la genera aquí (nunca al abrir la página). */
async function goNext(userId: string, name: string): Promise<never> {
  const stage = kitStage(await getKit(userId));
  if (typeof stage === "number" && stage <= 4) {
    try {
      await ensureRound(userId, name, stage as 1 | 2 | 3 | 4);
    } catch {
      // La página de la ronda ofrece "Empezar" otra vez.
    }
  }
  revalidatePath("/mi-marca/kit", "layout");
  redirect(stageUrl(stage));
}

export async function startRoundAction(_prev: KitActionState, fd: FormData): Promise<KitActionState> {
  const { user } = await requireCreatorAccess();
  const n = round(fd);
  if (!(await rateLimit(`kit-ia:user:${user.id}`, 40, HOUR))) return { error: "Demasiados intentos seguidos. Intenta en un rato." };
  try {
    const r = await ensureRound(user.id, user.name, n);
    if (r.error) return { error: r.error };
  } catch {
    return { error: "No pudimos generar las opciones con la IA. Intenta de nuevo en un momento." };
  }
  revalidatePath("/mi-marca/kit", "layout");
  redirect(`/mi-marca/kit/ronda/${n}`);
}

/* ───────────── Rondas ───────────── */

export async function chooseOptionsAction(_prev: KitActionState, fd: FormData): Promise<KitActionState> {
  const { user } = await requireCreatorAccess();
  const n = round(fd);
  const r = await chooseOptions(user.id, n, fd.getAll("opcion").filter((v): v is string => typeof v === "string"));
  if (!r.ok) return { error: r.error };
  return goNext(user.id, user.name);
}

export async function refreshAction(_prev: KitActionState, fd: FormData): Promise<KitActionState> {
  const { user } = await requireCreatorAccess();
  const n = round(fd);
  if (!(await rateLimit(`kit-ia:user:${user.id}`, 40, HOUR))) return { error: "Demasiados cambios seguidos. Intenta en un rato." };
  try {
    const r = await refreshRound(user.id, user.name, n, str(fd, "nota").trim());
    if (!r.ok) return { error: r.error };
  } catch {
    return { error: "No pudimos generar nuevas opciones. Intenta de nuevo en un momento." };
  }
  revalidatePath(`/mi-marca/kit/ronda/${n}`);
  redirect(`/mi-marca/kit/ronda/${n}`);
}

export async function chooseManualAction(_prev: KitActionState, fd: FormData): Promise<KitActionState> {
  const { user } = await requireCreatorAccess();
  const n = round(fd);
  const r = await chooseManual(user.id, n, { preset: str(fd, "preset"), titulos: str(fd, "titulos"), texto: str(fd, "texto"), style: str(fd, "style") });
  if (!r.ok) return { error: r.error };
  return goNext(user.id, user.name);
}

export async function chooseElementsAction(_prev: KitActionState, fd: FormData): Promise<KitActionState> {
  const { user } = await requireCreatorAccess();
  const r = await chooseElements(user.id, fd.getAll("elemento").filter((v): v is string => typeof v === "string"));
  if (!r.ok) return { error: r.error };
  return goNext(user.id, user.name);
}

/* ───────────── Revelación ───────────── */

export async function startRevealAction(): Promise<KitActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`kit-ia:user:${user.id}`, 40, HOUR))) return { error: "Demasiados intentos seguidos. Intenta en un rato." };
  try {
    const r = await startReveal(user.id, user.name);
    if (!r.ok) return { error: r.error };
  } catch {
    return { error: "No pudimos armar tu kit con la IA. Tus elecciones están guardadas: intenta de nuevo en un momento." };
  }
  revalidatePath("/mi-marca/kit", "layout");
  redirect("/mi-marca/kit/revelacion");
}

export async function submitVotesAction(_prev: KitActionState, fd: FormData): Promise<KitActionState> {
  const { user } = await requireCreatorAccess();
  const input: VoteInput = {};
  for (const id of PIECE_IDS) {
    const voto = str(fd, `voto_${id}`);
    if (voto !== "si" && voto !== "no") continue;
    const motivos = fd.getAll(`motivos_${id}`).filter((m): m is string => typeof m === "string" && VOTE_REASONS.some((r) => r.id === m));
    input[id as PieceId] = { voto, motivos, nota: str(fd, `nota_${id}`).trim().slice(0, 300) };
  }
  if (Object.keys(input).length === 0) return { error: "Califica al menos una pieza con 👍 o 👎." };
  if (!(await rateLimit(`kit-ia:user:${user.id}`, 40, HOUR))) return { error: "Demasiados ajustes seguidos. Intenta en un rato." };
  let approved = false;
  try {
    const r = await submitVotes(user.id, user.name, input);
    if (!r.ok) return { error: r.error };
    approved = r.approved;
  } catch {
    return { error: "No pudimos aplicar tus ajustes con la IA. Intenta de nuevo en un momento." };
  }
  if (approved) await audit({ action: "kit.approved", actorUserId: user.id, ip: await getClientIp() });
  revalidatePath("/mi-marca/kit", "layout");
  redirect("/mi-marca/kit/revelacion");
}

/* ───────────── Fotos y utilidades ───────────── */

export async function deletePhotoAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = z.string().uuid().safeParse(str(fd, "id"));
  if (id.success) await deletePhoto(user.id, id.data);
  revalidatePath("/mi-marca/kit", "layout");
  redirect("/mi-marca/kit/fotos");
}

export async function fillDefaultsAction(): Promise<void> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`kit-ia:user:${user.id}`, 40, HOUR))) redirect("/mi-marca/kit");
  try {
    await fillDefaults(user.id, user.name);
  } catch {
    redirect("/mi-marca/kit?error=ia");
  }
  return goNext(user.id, user.name);
}

export async function resetKitAction(): Promise<void> {
  const { user } = await requireCreatorAccess();
  await resetKit(user.id);
  await audit({ action: "kit.reset", actorUserId: user.id, ip: await getClientIp() });
  revalidatePath("/mi-marca/kit", "layout");
  redirect("/mi-marca/kit");
}
