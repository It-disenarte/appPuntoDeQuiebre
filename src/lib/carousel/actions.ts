"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { chooseIdea, createCarousel, deleteCarousel, editSlide, generateCarousel, moveSlide, refreshIdeas, removeImage, rewriteSlide, saveAnswers, setBackground, setFocal } from "./service";

export type CarouselActionState = { error?: string; ok?: boolean } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const uuid = z.string().uuid();
const slideN = z.coerce.number().int().min(1).max(12);
const page = (id: string) => `/carruseles/${id}`;
const AI_LIMIT = "Ya usaste la IA varias veces seguidas. Intenta de nuevo en una hora.";

async function guardAi(userId: string) {
  return rateLimit(`carrusel-ia:user:${userId}`, 30, HOUR);
}

export async function createCarouselAction(_prev: CarouselActionState, fd: FormData): Promise<CarouselActionState> {
  const { user } = await requireCreatorAccess();
  if (!(await guardAi(user.id))) return { error: AI_LIMIT };
  const piece = uuid.safeParse(str(fd, "pieza"));
  const kw = str(fd, "palabra_clave").trim();
  let id: string;
  try {
    const r = await createCarousel(
      user.id,
      { tema: str(fd, "tema"), origen: piece.success ? "parrilla" : "propio", tipo: str(fd, "tipo"), objetivo: str(fd, "objetivo"), palabra_clave: kw || null, estilo_imagenes: str(fd, "estilo_imagenes"), animado: str(fd, "animado") === "1" },
      piece.success ? piece.data : null,
    );
    if (!r.ok) return { error: r.error };
    id = r.id;
  } catch {
    return { error: "No pudimos proponer ideas ahora. Intenta de nuevo en un momento." };
  }
  revalidatePath("/carruseles");
  redirect(page(id));
}

/** Acción para cualquier paso que llama a la IA: valida, corre y vuelve a la misma pantalla. */
async function aiStep(id: string, run: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>): Promise<CarouselActionState> {
  const { user } = await requireCreatorAccess();
  if (!uuid.safeParse(id).success) return { error: "Carrusel no válido." };
  if (!(await guardAi(user.id))) return { error: AI_LIMIT };
  try {
    const r = await run(user.id);
    if (!r.ok) return { error: r.error };
  } catch {
    return { error: "La IA no respondió. Intenta de nuevo en un momento." };
  }
  revalidatePath(page(id));
  return { ok: true };
}

export const refreshIdeasAction = async (_p: CarouselActionState, fd: FormData) => aiStep(str(fd, "id"), (u) => refreshIdeas(u, str(fd, "id"), str(fd, "nota")));
export const chooseIdeaAction = async (_p: CarouselActionState, fd: FormData) => aiStep(str(fd, "id"), (u) => chooseIdea(u, str(fd, "id"), { ideaId: str(fd, "idea"), own: str(fd, "propia") }));
export const regenerateAction = async (_p: CarouselActionState, fd: FormData) => aiStep(str(fd, "id"), (u) => generateCarousel(u, str(fd, "id"), str(fd, "nota")));
export const rewriteSlideAction = async (_p: CarouselActionState, fd: FormData) => {
  const n = slideN.safeParse(str(fd, "n"));
  return n.success ? aiStep(str(fd, "id"), (u) => rewriteSlide(u, str(fd, "id"), n.data, str(fd, "nota"))) : { error: "Slide no válido." };
};
export const saveAnswersAction = async (_p: CarouselActionState, fd: FormData) =>
  aiStep(str(fd, "id"), (u) =>
    saveAnswers(u, str(fd, "id"), {
      estilo: str(fd, "estilo") || "elige_por_mi",
      ambiente: fd.getAll("ambiente").filter((v): v is string => typeof v === "string").slice(0, 4),
      aparece_creador: str(fd, "aparece_creador") || "no",
      colores: str(fd, "colores") || "kit",
      colores_otros: str(fd, "colores_otros").trim() || null,
      narracion: str(fd, "narracion"),
      herramienta: str(fd, "herramienta") || "no_se",
    }),
  );

/* ───────────── Edición sin IA (gratis, sin límite) ───────────── */

async function plain(id: string, run: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>): Promise<CarouselActionState> {
  const { user } = await requireCreatorAccess();
  if (!uuid.safeParse(id).success) return { error: "Carrusel no válido." };
  const r = await run(user.id);
  if (!r.ok) return { error: r.error };
  revalidatePath(page(id));
  return { ok: true };
}

export const editSlideAction = async (_p: CarouselActionState, fd: FormData) => {
  const n = slideN.safeParse(str(fd, "n"));
  if (!n.success) return { error: "Slide no válido." };
  return plain(str(fd, "id"), (u) => editSlide(u, str(fd, "id"), n.data, { titulo: str(fd, "titulo"), cuerpo: str(fd, "cuerpo").trim() || null, resaltar: str(fd, "resaltar").trim() || null, plantilla: str(fd, "plantilla") }));
};
export const moveSlideAction = async (fd: FormData): Promise<void> => {
  const n = slideN.safeParse(str(fd, "n"));
  const dir = str(fd, "dir") === "up" ? "up" : "down";
  if (n.success) await plain(str(fd, "id"), (u) => moveSlide(u, str(fd, "id"), n.data, dir));
};
export const setBackgroundAction = async (fd: FormData): Promise<void> => {
  await plain(str(fd, "id"), (u) => setBackground(u, str(fd, "id"), str(fd, "fondo")));
};
export const removeImageAction = async (fd: FormData): Promise<void> => {
  const n = slideN.safeParse(str(fd, "n"));
  if (n.success) await plain(str(fd, "id"), (u) => removeImage(u, str(fd, "id"), n.data));
};
export const setFocalAction = async (_p: CarouselActionState, fd: FormData) => {
  const n = slideN.safeParse(str(fd, "n"));
  if (!n.success) return { error: "Slide no válido." };
  return plain(str(fd, "id"), (u) => setFocal(u, str(fd, "id"), n.data, { x: Number(str(fd, "x")), y: Number(str(fd, "y")) }));
};

export async function deleteCarouselAction(fd: FormData): Promise<void> {
  const { user } = await requireCreatorAccess();
  const id = str(fd, "id");
  if (uuid.safeParse(id).success) await deleteCarousel(user.id, id);
  revalidatePath("/carruseles");
  redirect("/carruseles");
}
