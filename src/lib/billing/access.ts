// Regla de acceso según la suscripción. Función pura: se prueba sin proveedor de pagos.

export type AccessState =
  /** Sin suscripción (nunca pagó, canceló o expiró): debe suscribirse. */
  | "none"
  /** Pago iniciado pero no confirmado. */
  | "pending"
  | "trialing"
  | "active"
  /** Cobro fallido dentro del periodo de gracia: acceso con aviso. */
  | "grace"
  /** Cobro fallido fuera de la gracia o pausada: sesión suspendida hasta pagar. */
  | "suspended";

export type SubscriptionSnapshot = {
  status: string;
  pastDueSince: Date | null;
} | null;

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeAccess(sub: SubscriptionSnapshot, now: Date, graceDays: number): AccessState {
  if (!sub) return "none";
  switch (sub.status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid": {
      // Sin fecha de inicio de la mora se asume que acaba de empezar (gracia completa).
      const since = sub.pastDueSince ?? now;
      return now.getTime() - since.getTime() <= graceDays * DAY_MS ? "grace" : "suspended";
    }
    case "paused":
      return "suspended";
    case "incomplete":
      return "pending";
    default:
      // canceled, incomplete_expired y cualquier estado desconocido: sin acceso.
      return "none";
  }
}

/** ¿Puede usar la app de creador? */
export function hasCreatorAccess(state: AccessState): boolean {
  return state === "trialing" || state === "active" || state === "grace";
}

/** ¿Tiene una suscripción viva (no debe crear otra, sino gestionar la actual)? */
export function hasLiveSubscription(state: AccessState): boolean {
  return state !== "none";
}

export function graceEndsAt(pastDueSince: Date | null, graceDays: number): Date | null {
  return pastDueSince ? new Date(pastDueSince.getTime() + graceDays * DAY_MS) : null;
}
