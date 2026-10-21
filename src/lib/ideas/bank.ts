import "server-only";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { ideaBank } from "@/lib/db/schema";

export type BankIdea = typeof ideaBank.$inferSelect;
export type IdeaInput = { title: string; hook?: string; idea?: string; shortScript?: string | null; creator?: string | null };
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Cuántas ideas guardadas puede tener a la vez (las usadas no cuentan). */
export const MAX_BANK = 20;

const clip = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n);

/** Guarda una idea en el banco (si ya está guardada, devuelve la misma). */
export async function saveIdea(userId: string, raw: IdeaInput): Promise<Result<{ id: string; already: boolean }>> {
  const title = clip(raw.title, 140);
  if (title.length < 3) return { ok: false, error: "La idea necesita un título." };
  const [existing] = await db().select({ id: ideaBank.id }).from(ideaBank).where(and(eq(ideaBank.userId, userId), eq(ideaBank.title, title))).limit(1);
  if (existing) return { ok: true, id: existing.id, already: true };
  const [{ n }] = await db().select({ n: count() }).from(ideaBank).where(and(eq(ideaBank.userId, userId), eq(ideaBank.status, "guardada")));
  if ((n ?? 0) >= MAX_BANK) return { ok: false, error: `Tu banco ya tiene ${MAX_BANK} ideas. Quita alguna o conviértela en un video.` };
  const [row] = await db()
    .insert(ideaBank)
    .values({ userId, title, hook: clip(raw.hook, 300), idea: clip(raw.idea, 600), shortScript: clip(raw.shortScript, 800) || null, creator: clip(raw.creator, 60) || null })
    .returning({ id: ideaBank.id });
  return { ok: true, id: row!.id, already: false };
}

export const listIdeas = (userId: string, status?: "guardada" | "usada"): Promise<BankIdea[]> =>
  db()
    .select()
    .from(ideaBank)
    .where(status ? and(eq(ideaBank.userId, userId), eq(ideaBank.status, status)) : eq(ideaBank.userId, userId))
    .orderBy(desc(ideaBank.createdAt));

export const getIdea = async (userId: string, id: string): Promise<BankIdea | null> => {
  const [r] = await db().select().from(ideaBank).where(and(eq(ideaBank.id, id), eq(ideaBank.userId, userId))).limit(1);
  return r ?? null;
};

export async function removeIdea(userId: string, id: string): Promise<void> {
  await db().delete(ideaBank).where(and(eq(ideaBank.id, id), eq(ideaBank.userId, userId)));
}

/** Las ideas guardadas más antiguas, para que la parrilla de la próxima semana las tome como base. */
export const ideasForWeek = (userId: string, limit = 3): Promise<BankIdea[]> =>
  db().select().from(ideaBank).where(and(eq(ideaBank.userId, userId), eq(ideaBank.status, "guardada"))).orderBy(asc(ideaBank.createdAt)).limit(limit);

export async function markIdeasUsed(ids: string[], pieceId: string | null = null): Promise<void> {
  if (ids.length === 0) return;
  await db().update(ideaBank).set({ status: "usada", usedAt: new Date(), pieceId }).where(inArray(ideaBank.id, ids));
}
