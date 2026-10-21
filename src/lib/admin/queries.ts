import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { computeAccess } from "@/lib/billing/access";
import { db } from "@/lib/db";
import { commitments, invoiceRequests, payments, promoCodes, promoRedemptions, subscriptions, users } from "@/lib/db/schema";
import { env } from "@/lib/env";

export const PAGE_SIZE = 25;

export const STATUS_FILTERS = {
  prueba: ["trialing"],
  activa: ["active"],
  mora: ["past_due", "unpaid"],
  terminada: ["canceled", "incomplete_expired"],
} as const;
export type StatusFilter = keyof typeof STATUS_FILTERS | "sin";

/** Escapa comodines de LIKE para que la búsqueda sea literal. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Etapa del arranque en la que va el cliente (crece con cada fase). */
export function onboardingStage(hasSubscription: boolean, hasCommitment: boolean): string {
  if (!hasSubscription) return "Suscripción";
  if (!hasCommitment) return "Compromiso";
  return "Brújula";
}

export async function listClients(opts: { q?: string; plan?: "basico" | "pro"; status?: StatusFilter; account?: "activa" | "desactivada"; page: number }) {
  const conds: SQL[] = [eq(users.role, "creator")];
  if (opts.q) {
    const term = `%${likeEscape(opts.q)}%`;
    conds.push(or(ilike(users.name, term), ilike(users.email, term))!);
  }
  if (opts.plan) conds.push(eq(subscriptions.plan, opts.plan));
  if (opts.account === "desactivada") conds.push(eq(users.status, "disabled"));
  if (opts.account === "activa") conds.push(eq(users.status, "active"));
  if (opts.status === "sin") conds.push(isNull(subscriptions.id));
  else if (opts.status) conds.push(inArray(subscriptions.status, [...STATUS_FILTERS[opts.status]]));
  const where = and(...conds);

  const base = db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      plan: subscriptions.plan,
      subStatus: subscriptions.status,
      pastDueSince: subscriptions.pastDueSince,
      committed: sql<boolean>`${commitments.userId} is not null`,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .leftJoin(commitments, eq(commitments.userId, users.id))
    .where(where);

  const [rows, [total]] = await Promise.all([
    base.orderBy(desc(users.createdAt)).limit(PAGE_SIZE).offset((opts.page - 1) * PAGE_SIZE),
    db().select({ n: count() }).from(users).leftJoin(subscriptions, eq(subscriptions.userId, users.id)).where(where),
  ]);
  const grace = env().BILLING_GRACE_DAYS;
  const now = new Date();
  return {
    total: total?.n ?? 0,
    rows: rows.map((r) => ({
      ...r,
      access: computeAccess(r.subStatus ? { status: r.subStatus, pastDueSince: r.pastDueSince } : null, now, grace),
      stage: onboardingStage(Boolean(r.subStatus), r.committed),
    })),
  };
}

export async function getClient(id: string) {
  const [user] = await db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      birthDate: users.birthDate,
      termsVersion: users.termsVersion,
      termsAcceptedAt: users.termsAcceptedAt,
      billingCustomerId: users.billingCustomerId,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      proOverride: users.proOverride,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) return null;
  const [[sub], [commitment], paid, redemptions, invoices] = await Promise.all([
    db().select().from(subscriptions).where(eq(subscriptions.userId, id)).limit(1),
    db().select().from(commitments).where(eq(commitments.userId, id)).limit(1),
    db().select().from(payments).where(eq(payments.userId, id)).orderBy(desc(payments.paidAt)).limit(24),
    db()
      .select({ code: promoCodes.code, kind: promoCodes.kind, status: promoRedemptions.status, createdAt: promoRedemptions.createdAt, convertedAt: promoRedemptions.convertedAt })
      .from(promoRedemptions)
      .innerJoin(promoCodes, eq(promoRedemptions.codeId, promoCodes.id))
      .where(eq(promoRedemptions.userId, id))
      .orderBy(desc(promoRedemptions.createdAt)),
    db().select().from(invoiceRequests).where(eq(invoiceRequests.userId, id)).orderBy(desc(invoiceRequests.createdAt)),
  ]);
  const access = computeAccess(sub ? { status: sub.status, pastDueSince: sub.pastDueSince } : null, new Date(), env().BILLING_GRACE_DAYS);
  return { user, sub: sub ?? null, commitment: commitment ?? null, payments: paid, redemptions, invoices, access };
}

export async function listSubscriptions() {
  return db()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      plan: subscriptions.plan,
      status: subscriptions.status,
      trialEnd: subscriptions.trialEnd,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      pastDueSince: subscriptions.pastDueSince,
    })
    .from(subscriptions)
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .orderBy(asc(subscriptions.currentPeriodEnd))
    .limit(500);
}

export async function listPromoCodes() {
  const codes = await db().select().from(promoCodes).orderBy(desc(promoCodes.createdAt)).limit(200);
  const stats = await db()
    .select({
      codeId: promoRedemptions.codeId,
      completed: sql<number>`count(*) filter (where ${promoRedemptions.status} = 'completed')::int`,
      converted: sql<number>`count(*) filter (where ${promoRedemptions.convertedAt} is not null)::int`,
    })
    .from(promoRedemptions)
    .groupBy(promoRedemptions.codeId);
  const byCode = new Map(stats.map((s) => [s.codeId, s]));
  return codes.map((c) => ({ ...c, completed: byCode.get(c.id)?.completed ?? 0, converted: byCode.get(c.id)?.converted ?? 0 }));
}

export async function listInvoiceRequests(status: "pendiente" | "resueltas") {
  const q = db()
    .select({
      id: invoiceRequests.id,
      status: invoiceRequests.status,
      rfc: invoiceRequests.rfc,
      razonSocial: invoiceRequests.razonSocial,
      regimenFiscal: invoiceRequests.regimenFiscal,
      codigoPostal: invoiceRequests.codigoPostal,
      usoCfdi: invoiceRequests.usoCfdi,
      email: invoiceRequests.email,
      notes: invoiceRequests.notes,
      adminNote: invoiceRequests.adminNote,
      createdAt: invoiceRequests.createdAt,
      handledAt: invoiceRequests.handledAt,
      userName: users.name,
      userEmail: users.email,
      amountCents: payments.amountCents,
      currency: payments.currency,
      paidAt: payments.paidAt,
      providerInvoiceId: payments.providerInvoiceId,
    })
    .from(invoiceRequests)
    .innerJoin(users, eq(invoiceRequests.userId, users.id))
    .leftJoin(payments, eq(invoiceRequests.paymentId, payments.id));
  return status === "pendiente"
    ? q.where(eq(invoiceRequests.status, "pendiente")).orderBy(asc(invoiceRequests.createdAt)).limit(200)
    : q.where(sql`${invoiceRequests.status} <> 'pendiente'`).orderBy(desc(invoiceRequests.handledAt)).limit(50);
}

export async function listAdmins() {
  return db()
    .select({ id: users.id, name: users.name, email: users.email, status: users.status, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.createdAt));
}
