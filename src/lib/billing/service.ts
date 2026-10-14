import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { auditLog, billingEvents, payments, promoCodes, promoRedemptions, subscriptions, users, type Subscription } from "@/lib/db/schema";
import { env } from "@/lib/env";
import type { PlanId } from "@/lib/plans";
import { computeAccess, graceEndsAt, hasLiveSubscription, type AccessState } from "./access";
import { customerIdOf, mapSubscription, nextPastDueSince, shouldOverwrite, type ProviderSubscription } from "./map";
import { checkPromo, normalizeCode, PROMO_ERROR_TEXT } from "./promo";
import { billingConfigured, planForPriceId, priceIdFor, stripe } from "./stripe";

/* ───────────── Lectura ───────────── */

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const [sub] = await db().select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return sub ?? null;
}

export type AccessInfo = {
  state: AccessState;
  subscription: Subscription | null;
  graceEndsAt: Date | null;
};

export async function getAccess(userId: string): Promise<AccessInfo> {
  const sub = await getSubscription(userId);
  const grace = env().BILLING_GRACE_DAYS;
  return {
    state: computeAccess(sub, new Date(), grace),
    subscription: sub,
    graceEndsAt: graceEndsAt(sub?.pastDueSince ?? null, grace),
  };
}

/** ¿Ya tuvo una suscripción o una prueba? (la prueba gratis es una sola vez por cuenta). */
async function userHadTrialOrSubscription(userId: string): Promise<boolean> {
  const [sub] = await db().select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (sub) return true;
  const [trial] = await db()
    .select({ id: promoRedemptions.id })
    .from(promoRedemptions)
    .innerJoin(promoCodes, eq(promoRedemptions.codeId, promoCodes.id))
    .where(and(eq(promoRedemptions.userId, userId), eq(promoRedemptions.status, "completed"), eq(promoCodes.kind, "trial")))
    .limit(1);
  return Boolean(trial);
}

/** Vista previa de un código para mostrar al usuario antes de pagar (no reserva). */
export async function previewPromo(rawCode: string, plan: PlanId, userId: string) {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false as const, error: PROMO_ERROR_TEXT.inexistente };
  const [promo] = await db().select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
  const error = checkPromo(promo ?? null, { plan, now: new Date(), userHadTrialOrSubscription: await userHadTrialOrSubscription(userId) });
  if (error || !promo) return { ok: false as const, error: PROMO_ERROR_TEXT[error ?? "inexistente"] };
  return { ok: true as const, promo };
}

/* ───────────── Cliente del proveedor ───────────── */

async function ensureCustomer(user: { id: string; email: string; name: string }): Promise<string> {
  const [row] = await db().select({ customer: users.billingCustomerId }).from(users).where(eq(users.id, user.id)).limit(1);
  if (row?.customer) return row.customer;
  // La clave de idempotencia evita clientes duplicados si dos peticiones llegan a la vez.
  const customer = await stripe().customers.create(
    { email: user.email, name: user.name, metadata: { userId: user.id } },
    { idempotencyKey: `pdq-customer-${user.id}` },
  );
  await db().update(users).set({ billingCustomerId: customer.id }).where(and(eq(users.id, user.id), isNull(users.billingCustomerId)));
  const [after] = await db().select({ customer: users.billingCustomerId }).from(users).where(eq(users.id, user.id)).limit(1);
  return after!.customer!;
}

/* ───────────── Reservas de códigos ───────────── */

/** Libera una reserva (al expirar o abandonar el pago) y devuelve el uso al código. */
async function releaseRedemption(where: { checkoutId?: string; redemptionId?: string }) {
  await db().transaction(async (tx) => {
    const cond = where.checkoutId ? eq(promoRedemptions.checkoutId, where.checkoutId) : eq(promoRedemptions.id, where.redemptionId!);
    const [red] = await tx
      .update(promoRedemptions)
      .set({ status: "released" })
      .where(and(cond, eq(promoRedemptions.status, "reserved")))
      .returning({ codeId: promoRedemptions.codeId });
    if (red) await tx.update(promoCodes).set({ uses: sql`greatest(${promoCodes.uses} - 1, 0)` }).where(eq(promoCodes.id, red.codeId));
  });
}

/* ───────────── Checkout y portal ───────────── */

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

export async function startCheckout(
  user: { id: string; email: string; name: string },
  plan: PlanId,
  rawCode: string | null,
): Promise<CheckoutResult> {
  if (!billingConfigured()) return { ok: false, error: "Los pagos todavía no están disponibles. Intenta más tarde." };

  const access = await getAccess(user.id);
  if (hasLiveSubscription(access.state)) return { ok: false, error: "Ya tienes una suscripción. Adminístrala desde “Gestionar pago”." };

  // Si había un pago abandonado con código reservado, se libera antes de crear otro.
  const pending = await db()
    .select({ id: promoRedemptions.id, checkoutId: promoRedemptions.checkoutId })
    .from(promoRedemptions)
    .where(and(eq(promoRedemptions.userId, user.id), eq(promoRedemptions.status, "reserved")));
  for (const p of pending) {
    if (p.checkoutId) await stripe().checkout.sessions.expire(p.checkoutId).catch(() => undefined);
    await releaseRedemption({ redemptionId: p.id });
  }

  // Reserva atómica del código: se valida y se suma el uso dentro de una transacción con candado de fila.
  let redemption: { id: string; trialDays: number | null; couponId: string | null } | null = null;
  if (rawCode) {
    const code = normalizeCode(rawCode);
    if (!code) return { ok: false, error: PROMO_ERROR_TEXT.inexistente };
    const hadTrial = await userHadTrialOrSubscription(user.id);
    const result = await db().transaction(async (tx) => {
      const [promo] = await tx.select().from(promoCodes).where(eq(promoCodes.code, code)).for("update").limit(1);
      const error = checkPromo(promo ?? null, { plan, now: new Date(), userHadTrialOrSubscription: hadTrial });
      if (error || !promo) return { error: PROMO_ERROR_TEXT[error ?? "inexistente"] };
      await tx.update(promoCodes).set({ uses: sql`${promoCodes.uses} + 1` }).where(eq(promoCodes.id, promo.id));
      const [red] = await tx.insert(promoRedemptions).values({ codeId: promo.id, userId: user.id }).returning({ id: promoRedemptions.id });
      return { id: red!.id, trialDays: promo.kind === "trial" ? promo.trialDays : null, couponId: promo.providerCouponId };
    });
    if ("error" in result) return { ok: false, error: result.error! };
    if (!result.trialDays && !result.couponId) {
      await releaseRedemption({ redemptionId: result.id });
      return { ok: false, error: "Ese código no está bien configurado. Avísanos." };
    }
    redemption = result;
  }

  try {
    const customer = await ensureCustomer(user);
    const appUrl = env().APP_URL;
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price: priceIdFor(plan), quantity: 1 }],
      // La tarjeta se registra aunque haya prueba gratis (cobro automático al terminar).
      payment_method_collection: "always",
      locale: "es-419",
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      metadata: { userId: user.id, plan, redemptionId: redemption?.id ?? "" },
      subscription_data: {
        metadata: { userId: user.id, plan },
        ...(redemption?.trialDays
          ? { trial_period_days: redemption.trialDays, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } }
          : {}),
      },
      ...(redemption?.couponId ? { discounts: [{ coupon: redemption.couponId }] } : {}),
      success_url: `${appUrl}/suscripcion/exito?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/suscripcion?cancelado=1`,
    });
    if (redemption) await db().update(promoRedemptions).set({ checkoutId: session.id }).where(eq(promoRedemptions.id, redemption.id));
    if (!session.url) throw new Error("Checkout sin URL");
    return { ok: true, url: session.url };
  } catch (err) {
    if (redemption) await releaseRedemption({ redemptionId: redemption.id });
    console.error("[billing] no se pudo crear el checkout", err);
    return { ok: false, error: "No pudimos abrir la página de pago. Intenta de nuevo en un momento." };
  }
}

export async function openPortal(userId: string): Promise<string | null> {
  if (!billingConfigured()) return null;
  const [row] = await db().select({ customer: users.billingCustomerId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!row?.customer) return null;
  const session = await stripe().billingPortal.sessions.create({ customer: row.customer, return_url: `${env().APP_URL}/mi-marca`, locale: "es-419" });
  return session.url;
}

/** Al volver de Stripe: confirma el pago sin esperar al webhook (y verifica que la sesión sea de este usuario). */
export async function confirmCheckout(sessionId: string, userId: string): Promise<boolean> {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return false;
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id !== userId || session.status !== "complete") return false;
  await completeRedemption(session.id);
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (subId) await syncSubscription(subId);
  return true;
}

/* ───────────── Sincronización ───────────── */

async function completeRedemption(checkoutId: string) {
  await db()
    .update(promoRedemptions)
    .set({ status: "completed" })
    .where(and(eq(promoRedemptions.checkoutId, checkoutId), eq(promoRedemptions.status, "reserved")));
}

/** Trae la suscripción fresca del proveedor y la guarda. Siempre consulta a Stripe: inmune a eventos desordenados. */
export async function syncSubscription(providerSubscriptionId: string): Promise<void> {
  const sub = (await stripe().subscriptions.retrieve(providerSubscriptionId)) as unknown as ProviderSubscription;
  const row = mapSubscription(sub, planForPriceId);
  if (!row) {
    console.warn("[billing] suscripción con precio ajeno a la app, se ignora", sub.id);
    return;
  }
  const customerId = customerIdOf(sub);
  const [user] = await db().select({ id: users.id }).from(users).where(eq(users.billingCustomerId, customerId)).limit(1);
  if (!user) {
    console.warn("[billing] suscripción de un cliente desconocido", sub.id);
    return;
  }

  await db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"billing:user:" + user.id}))`);
    const [existing] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
    if (!shouldOverwrite(existing ?? null, row)) return;
    const sameSub = existing?.providerSubscriptionId === row.providerSubscriptionId;
    const pastDueSince = nextPastDueSince(sameSub ? (existing?.pastDueSince ?? null) : null, row.status, new Date());
    const values = { ...row, pastDueSince };
    if (existing) await tx.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
    else await tx.insert(subscriptions).values({ ...values, userId: user.id });
    if (existing?.status !== row.status) {
      await tx.insert(auditLog).values({
        action: "billing.status_changed",
        targetUserId: user.id,
        meta: { from: existing?.status ?? null, to: row.status, plan: row.plan },
      });
    }
  });
}

async function recordPayment(invoice: Stripe.Invoice) {
  if (!invoice.amount_paid || invoice.amount_paid <= 0 || !invoice.id) return;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const [user] = await db().select({ id: users.id }).from(users).where(eq(users.billingCustomerId, customerId)).limit(1);
  if (!user) return;
  const paidAt = invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date();
  await db()
    .insert(payments)
    .values({
      userId: user.id,
      providerInvoiceId: invoice.id,
      amountCents: invoice.amount_paid,
      currency: invoice.currency,
      paidAt,
      receiptUrl: invoice.hosted_invoice_url ?? null,
    })
    .onConflictDoNothing();
  // Conversión: el primer cobro real después de usar un código.
  const [red] = await db()
    .select({ id: promoRedemptions.id })
    .from(promoRedemptions)
    .where(and(eq(promoRedemptions.userId, user.id), eq(promoRedemptions.status, "completed"), isNull(promoRedemptions.convertedAt)))
    .orderBy(desc(promoRedemptions.createdAt))
    .limit(1);
  if (red) await db().update(promoRedemptions).set({ convertedAt: paidAt }).where(eq(promoRedemptions.id, red.id));
}

function subscriptionIdOfInvoice(invoice: Stripe.Invoice): string | null {
  const s = invoice.parent?.subscription_details?.subscription;
  return typeof s === "string" ? s : (s?.id ?? null);
}

/* ───────────── Webhooks ───────────── */

/** Verifica la firma y procesa una sola vez cada evento. Lanza si falla para que Stripe reintente. */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<"ok" | "duplicado" | "firma-invalida"> {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) return "firma-invalida";
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return "firma-invalida";
  }

  const inserted = await db().insert(billingEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning({ id: billingEvents.id });
  if (inserted.length === 0) {
    const [prev] = await db().select({ processedAt: billingEvents.processedAt }).from(billingEvents).where(eq(billingEvents.id, event.id)).limit(1);
    if (prev?.processedAt) return "duplicado";
  }

  try {
    await processEvent(event);
    await db().update(billingEvents).set({ processedAt: new Date() }).where(eq(billingEvents.id, event.id));
    return "ok";
  } catch (err) {
    console.error("[billing] error procesando", event.type, event.id, err);
    throw err;
  }
}

async function processEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.mode !== "subscription") return;
      await completeRedemption(s.id);
      const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
      if (subId) await syncSubscription(subId);
      return;
    }
    case "checkout.session.expired":
      await releaseRedemption({ checkoutId: event.data.object.id });
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await syncSubscription(event.data.object.id);
      return;
    case "invoice.paid": {
      await recordPayment(event.data.object);
      const subId = subscriptionIdOfInvoice(event.data.object);
      if (subId) await syncSubscription(subId);
      return;
    }
    case "invoice.payment_failed": {
      const subId = subscriptionIdOfInvoice(event.data.object);
      if (subId) await syncSubscription(subId);
      return;
    }
    default:
      return;
  }
}

/* ───────────── Códigos (admin) ───────────── */

export async function createProviderCoupon(input: { code: string; percentOff: number; durationMonths: number | null }): Promise<string> {
  const coupon = await stripe().coupons.create({
    name: input.code,
    percent_off: input.percentOff,
    ...(input.durationMonths ? { duration: "repeating", duration_in_months: input.durationMonths } : { duration: "once" }),
    metadata: { pdqCode: input.code },
  });
  return coupon.id;
}

/* ───────────── Precios para mostrar ───────────── */

export type PlanPrice = { amountCents: number; currency: string; interval: string };
let priceCache: { at: number; prices: Partial<Record<PlanId, PlanPrice>> } | null = null;

/** Precio mensual de cada plan, leído del proveedor (caché de 10 min). */
export async function getPlanPrices(): Promise<Partial<Record<PlanId, PlanPrice>>> {
  if (!billingConfigured()) return {};
  if (priceCache && Date.now() - priceCache.at < 10 * 60 * 1000) return priceCache.prices;
  const prices: Partial<Record<PlanId, PlanPrice>> = {};
  for (const plan of ["basico", "pro"] as const) {
    try {
      const p = await stripe().prices.retrieve(priceIdFor(plan));
      if (p.unit_amount !== null) prices[plan] = { amountCents: p.unit_amount, currency: p.currency, interval: p.recurring?.interval ?? "month" };
    } catch (err) {
      console.error("[billing] no se pudo leer el precio", plan, err);
    }
  }
  priceCache = { at: Date.now(), prices };
  return prices;
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}
