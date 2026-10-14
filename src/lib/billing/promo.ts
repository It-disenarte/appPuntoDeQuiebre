// Validación de códigos promocionales. Función pura (la reserva atómica vive en service.ts).

import type { PlanId } from "@/lib/plans";

export type PromoForCheck = {
  kind: "trial" | "discount";
  plan: PlanId | null;
  active: boolean;
  maxUses: number | null;
  uses: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type PromoError = "inexistente" | "inactivo" | "aun-no-vigente" | "vencido" | "agotado" | "otro-plan" | "prueba-usada";

export const PROMO_ERROR_TEXT: Record<PromoError, string> = {
  inexistente: "Ese código no existe.",
  inactivo: "Ese código ya no está disponible.",
  "aun-no-vigente": "Ese código todavía no está vigente.",
  vencido: "Ese código ya venció.",
  agotado: "Ese código ya alcanzó su límite de usos.",
  "otro-plan": "Ese código no aplica para el plan elegido.",
  "prueba-usada": "La prueba gratis solo se puede usar una vez por cuenta.",
};

/** Normaliza lo que escribe el usuario: mayúsculas, sin espacios. Devuelve null si no es válido. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9_-]{3,40}$/.test(code) ? code : null;
}

export function checkPromo(
  promo: PromoForCheck | null,
  ctx: { plan: PlanId; now: Date; userHadTrialOrSubscription: boolean },
): PromoError | null {
  if (!promo) return "inexistente";
  if (!promo.active) return "inactivo";
  if (promo.startsAt && ctx.now < promo.startsAt) return "aun-no-vigente";
  if (promo.endsAt && ctx.now > promo.endsAt) return "vencido";
  if (promo.maxUses !== null && promo.uses >= promo.maxUses) return "agotado";
  if (promo.plan && promo.plan !== ctx.plan) return "otro-plan";
  if (promo.kind === "trial" && ctx.userHadTrialOrSubscription) return "prueba-usada";
  return null;
}
