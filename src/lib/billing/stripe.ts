import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";
import type { PlanId } from "@/lib/plans";

/**
 * Único punto de contacto con el SDK de Stripe. El resto de la app usa src/lib/billing/service.ts,
 * para que cambiar de proveedor no obligue a tocar pantallas ni acciones.
 */

export class BillingNotConfiguredError extends Error {
  constructor() {
    super("Los pagos no están configurados (faltan STRIPE_SECRET_KEY o los precios).");
  }
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new BillingNotConfiguredError();
  client ??= new Stripe(key, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "punto-de-quiebre-app" },
  });
  return client;
}

export function billingConfigured(): boolean {
  const e = env();
  return Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_PRICE_BASICO && e.STRIPE_PRICE_PRO);
}

export function isLiveMode(): boolean {
  return env().STRIPE_SECRET_KEY?.includes("_live_") ?? false;
}

export function priceIdFor(plan: PlanId): string {
  const id = plan === "basico" ? env().STRIPE_PRICE_BASICO : env().STRIPE_PRICE_PRO;
  if (!id) throw new BillingNotConfiguredError();
  return id;
}

export function planForPriceId(priceId: string | undefined | null): PlanId | null {
  if (!priceId) return null;
  if (priceId === env().STRIPE_PRICE_BASICO) return "basico";
  if (priceId === env().STRIPE_PRICE_PRO) return "pro";
  return null;
}

/** Enlace al cliente en el panel de Stripe (para el admin). */
export function dashboardCustomerUrl(customerId: string): string {
  return `https://dashboard.stripe.com/${isLiveMode() ? "" : "test/"}customers/${encodeURIComponent(customerId)}`;
}

export type { Stripe };
