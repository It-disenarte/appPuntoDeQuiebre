// Traducción pura de objetos del proveedor a nuestras filas (se prueba sin red).

import type { PlanId } from "@/lib/plans";

/** Forma mínima de una suscripción de Stripe que usamos (API 2026-09-30). */
export type ProviderSubscription = {
  id: string;
  status: string;
  customer: string | { id: string };
  trial_end: number | null;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  metadata: Record<string, string>;
  items: { data: Array<{ price: { id: string }; current_period_end: number }> };
};

export type SubscriptionRow = {
  providerSubscriptionId: string;
  plan: PlanId;
  status: string;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export const TERMINAL_STATUSES = new Set(["canceled", "incomplete_expired"]);
export const PAST_DUE_STATUSES = new Set(["past_due", "unpaid"]);

const toDate = (s: number | null | undefined) => (typeof s === "number" ? new Date(s * 1000) : null);

export function customerIdOf(sub: Pick<ProviderSubscription, "customer">): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

/** Devuelve null si el precio no corresponde a ningún plan nuestro (suscripción ajena a la app). */
export function mapSubscription(
  sub: ProviderSubscription,
  planForPrice: (priceId: string) => PlanId | null,
): SubscriptionRow | null {
  const item = sub.items.data[0];
  const plan = item ? planForPrice(item.price.id) : null;
  if (!plan) return null;
  // En la API actual el periodo vive en cada concepto: se toma el más lejano.
  const periodEnd = sub.items.data.reduce<number | null>((max, it) => (max === null || it.current_period_end > max ? it.current_period_end : max), null);
  return {
    providerSubscriptionId: sub.id,
    plan,
    status: sub.status,
    trialEnd: toDate(sub.trial_end),
    currentPeriodEnd: toDate(periodEnd),
    cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
  };
}

/**
 * Decide si un evento debe sobrescribir la fila guardada. Protege contra eventos fuera de orden:
 * un "canceled" de una suscripción VIEJA no debe pisar la suscripción nueva y vigente.
 */
export function shouldOverwrite(
  existing: { providerSubscriptionId: string; status: string } | null,
  incoming: { providerSubscriptionId: string; status: string },
): boolean {
  if (!existing) return true;
  if (existing.providerSubscriptionId === incoming.providerSubscriptionId) return true;
  const existingLive = !TERMINAL_STATUSES.has(existing.status);
  const incomingTerminal = TERMINAL_STATUSES.has(incoming.status);
  return !(existingLive && incomingTerminal);
}

/** Inicio de la mora: se conserva si ya existía; se borra al regularizarse. */
export function nextPastDueSince(prev: Date | null, status: string, now: Date): Date | null {
  if (!PAST_DUE_STATUSES.has(status)) return null;
  return prev ?? now;
}
