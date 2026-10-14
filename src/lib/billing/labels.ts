import type { AccessState } from "./access";

const dateFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });
export const formatDate = (d: Date) => dateFmt.format(d);

const DAY_MS = 24 * 60 * 60 * 1000;
export function daysUntil(d: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / DAY_MS));
}

export const ACCESS_LABEL: Record<AccessState, string> = {
  none: "Sin suscripción",
  pending: "Pago en proceso",
  trialing: "Prueba gratis",
  active: "Activa",
  grace: "Pago pendiente",
  suspended: "Suspendida",
};

export const ACCESS_TONE: Record<AccessState, "neutral" | "azul" | "exito" | "alerta" | "naranja"> = {
  none: "neutral",
  pending: "neutral",
  trialing: "azul",
  active: "exito",
  grace: "naranja",
  suspended: "alerta",
};

/** Frase corta para el usuario sobre su suscripción. */
export function subscriptionSummary(
  state: AccessState,
  sub: { trialEnd: Date | null; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean } | null,
  graceEndsAt: Date | null,
): string {
  if (!sub) return "Aún no tienes un plan.";
  if (state === "trialing" && sub.trialEnd) {
    const d = daysUntil(sub.trialEnd);
    return sub.cancelAtPeriodEnd
      ? `Prueba gratis hasta el ${formatDate(sub.trialEnd)}. Cancelaste: no habrá cobro.`
      : `Prueba gratis · quedan ${d} ${d === 1 ? "día" : "días"}. Primer cobro el ${formatDate(sub.trialEnd)}.`;
  }
  if (state === "active" && sub.currentPeriodEnd) {
    return sub.cancelAtPeriodEnd
      ? `Cancelaste tu plan. Tienes acceso hasta el ${formatDate(sub.currentPeriodEnd)}.`
      : `Se renueva el ${formatDate(sub.currentPeriodEnd)}.`;
  }
  if (state === "grace") {
    return graceEndsAt
      ? `No pudimos cobrar tu plan. Actualiza tu pago antes del ${formatDate(graceEndsAt)} para no perder el acceso.`
      : "No pudimos cobrar tu plan. Actualiza tu pago.";
  }
  if (state === "suspended") return "Tu acceso está suspendido por falta de pago. Actualiza tu pago para volver.";
  if (state === "pending") return "Estamos confirmando tu pago.";
  return "Tu suscripción terminó.";
}
