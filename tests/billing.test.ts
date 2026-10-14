import { describe, expect, it } from "vitest";
import { computeAccess, hasCreatorAccess, hasLiveSubscription } from "@/lib/billing/access";
import { mapSubscription, nextPastDueSince, shouldOverwrite, type ProviderSubscription } from "@/lib/billing/map";
import { checkPromo, normalizeCode, type PromoForCheck } from "@/lib/billing/promo";
import { COMMITMENT_QUESTIONS, wrongAnswers } from "@/lib/commitment";
import { ageFromBirthDate, RFC_REGEX } from "@/lib/validation";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-20T18:00:00Z");

describe("acceso según la suscripción", () => {
  it("estados vigentes y sin suscripción", () => {
    expect(computeAccess(null, now, 7)).toBe("none");
    expect(computeAccess({ status: "trialing", pastDueSince: null }, now, 7)).toBe("trialing");
    expect(computeAccess({ status: "active", pastDueSince: null }, now, 7)).toBe("active");
    expect(computeAccess({ status: "canceled", pastDueSince: null }, now, 7)).toBe("none");
    expect(computeAccess({ status: "incomplete_expired", pastDueSince: null }, now, 7)).toBe("none");
    expect(computeAccess({ status: "incomplete", pastDueSince: null }, now, 7)).toBe("pending");
    expect(computeAccess({ status: "estado-raro", pastDueSince: null }, now, 7)).toBe("none");
  });
  it("gracia de 7 días y luego suspensión", () => {
    const at = (days: number) => ({ status: "past_due", pastDueSince: new Date(now.getTime() - days * DAY) });
    expect(computeAccess(at(0), now, 7)).toBe("grace");
    expect(computeAccess(at(7), now, 7)).toBe("grace");
    expect(computeAccess(at(7.01), now, 7)).toBe("suspended");
    expect(computeAccess({ status: "unpaid", pastDueSince: new Date(now.getTime() - 30 * DAY) }, now, 7)).toBe("suspended");
    expect(computeAccess({ status: "past_due", pastDueSince: null }, now, 7)).toBe("grace");
    expect(computeAccess({ status: "paused", pastDueSince: null }, now, 7)).toBe("suspended");
  });
  it("quién entra a la app y quién no puede crear otra suscripción", () => {
    expect(hasCreatorAccess("grace")).toBe(true);
    expect(hasCreatorAccess("suspended")).toBe(false);
    expect(hasCreatorAccess("pending")).toBe(false);
    expect(hasLiveSubscription("suspended")).toBe(true);
    expect(hasLiveSubscription("none")).toBe(false);
  });
});

describe("códigos promocionales", () => {
  const base: PromoForCheck = { kind: "trial", plan: "basico", active: true, maxUses: 10, uses: 3, startsAt: null, endsAt: null };
  const ctx = { plan: "basico" as const, now, userHadTrialOrSubscription: false };
  it("normaliza", () => {
    expect(normalizeCode(" webinar oct ")).toBe("WEBINAROCT");
    expect(normalizeCode("ab")).toBeNull();
    expect(normalizeCode("<script>")).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });
  it("valida reglas", () => {
    expect(checkPromo(base, ctx)).toBeNull();
    expect(checkPromo(null, ctx)).toBe("inexistente");
    expect(checkPromo({ ...base, active: false }, ctx)).toBe("inactivo");
    expect(checkPromo({ ...base, uses: 10 }, ctx)).toBe("agotado");
    expect(checkPromo({ ...base, maxUses: null, uses: 9999 }, ctx)).toBeNull();
    expect(checkPromo({ ...base, startsAt: new Date(now.getTime() + DAY) }, ctx)).toBe("aun-no-vigente");
    expect(checkPromo({ ...base, endsAt: new Date(now.getTime() - 1) }, ctx)).toBe("vencido");
    expect(checkPromo(base, { ...ctx, plan: "pro" })).toBe("otro-plan");
    expect(checkPromo({ ...base, plan: null }, { ...ctx, plan: "pro" })).toBeNull();
    expect(checkPromo(base, { ...ctx, userHadTrialOrSubscription: true })).toBe("prueba-usada");
    expect(checkPromo({ ...base, kind: "discount" }, { ...ctx, userHadTrialOrSubscription: true })).toBeNull();
  });
});

describe("traducción de suscripciones del proveedor", () => {
  const plans = (id: string) => (id === "price_b" ? ("basico" as const) : id === "price_p" ? ("pro" as const) : null);
  const sub = (over: Partial<ProviderSubscription> = {}): ProviderSubscription => ({
    id: "sub_1",
    status: "trialing",
    customer: "cus_1",
    trial_end: 1_800_000_000,
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: {},
    items: { data: [{ price: { id: "price_b" }, current_period_end: 1_800_000_000 }] },
    ...over,
  });
  it("mapea plan, fechas y cancelación", () => {
    const row = mapSubscription(sub(), plans)!;
    expect(row.plan).toBe("basico");
    expect(row.trialEnd?.toISOString()).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(row.cancelAtPeriodEnd).toBe(false);
    expect(mapSubscription(sub({ cancel_at: 1_900_000_000 }), plans)!.cancelAtPeriodEnd).toBe(true);
    expect(mapSubscription(sub({ items: { data: [{ price: { id: "price_otro" }, current_period_end: 1 }] } }), plans)).toBeNull();
  });
  it("ignora un 'canceled' viejo que llega tarde y no pisa la suscripción vigente", () => {
    expect(shouldOverwrite({ providerSubscriptionId: "sub_nueva", status: "active" }, { providerSubscriptionId: "sub_vieja", status: "canceled" })).toBe(false);
    expect(shouldOverwrite({ providerSubscriptionId: "sub_vieja", status: "canceled" }, { providerSubscriptionId: "sub_nueva", status: "active" })).toBe(true);
    expect(shouldOverwrite({ providerSubscriptionId: "sub_1", status: "active" }, { providerSubscriptionId: "sub_1", status: "canceled" })).toBe(true);
    expect(shouldOverwrite(null, { providerSubscriptionId: "sub_1", status: "trialing" })).toBe(true);
  });
  it("conserva el inicio de la mora y lo limpia al pagar", () => {
    const first = new Date("2026-10-01T00:00:00Z");
    expect(nextPastDueSince(null, "past_due", now)).toEqual(now);
    expect(nextPastDueSince(first, "past_due", now)).toEqual(first);
    expect(nextPastDueSince(first, "active", now)).toBeNull();
  });
});

describe("validaciones de registro y factura", () => {
  it("edad en hora de México", () => {
    expect(ageFromBirthDate("2008-10-20", now)).toBe(18);
    expect(ageFromBirthDate("2008-10-21", now)).toBe(17);
    expect(ageFromBirthDate("2008-02-30", now)).toBeNull();
    expect(ageFromBirthDate("2030-01-01", now)).toBeNull();
    expect(ageFromBirthDate("no-fecha", now)).toBeNull();
  });
  it("RFC", () => {
    expect(RFC_REGEX.test("XAXX010101000")).toBe(true);
    expect(RFC_REGEX.test("ABC010101AB1")).toBe(true);
    expect(RFC_REGEX.test("ABC011301AB1")).toBe(false);
    expect(RFC_REGEX.test("abc010101ab1")).toBe(false);
  });
  it("compromiso", () => {
    const all = Object.fromEntries(COMMITMENT_QUESTIONS.map((q) => [q.id, q.correct]));
    expect(wrongAnswers(all)).toEqual([]);
    expect(wrongAnswers({ ...all, siembra: "a" })).toEqual(["siembra"]);
    expect(wrongAnswers({})).toHaveLength(COMMITMENT_QUESTIONS.length);
  });
});
