"use server";

import { eq, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { TOUR_IDS } from "./tours";

/** Marca una guía como vista (idempotente). */
export async function markTourSeenAction(id: string): Promise<void> {
  const user = await requireUser();
  if (!TOUR_IDS.includes(id)) return;
  await db()
    .update(users)
    .set({ toursSeen: sql`CASE WHEN ${id} = ANY(${users.toursSeen}) THEN ${users.toursSeen} ELSE array_append(${users.toursSeen}, ${id}) END` })
    .where(eq(users.id, user.id));
}

/** Vuelve a mostrar todas las guías. */
export async function resetToursAction(): Promise<void> {
  const user = await requireUser();
  await db().update(users).set({ toursSeen: [] }).where(eq(users.id, user.id));
}
