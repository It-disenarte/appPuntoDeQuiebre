// Planes y lo que incluye cada uno (documento maestro, "Planes y reglas del motor").
// Los precios viven en el proveedor de pagos; aquí solo la descripción para mostrar.

export type PlanId = "basico" | "pro";

export const PLANS: Record<PlanId, { name: string; tagline: string; features: string[] }> = {
  basico: {
    name: "Básico",
    tagline: "Todo para crear tu marca con constancia.",
    features: [
      "4 videos por semana (3 + 1 variante de prueba)",
      "3 carruseles por semana",
      "1 historia diaria sugerida",
      "Analizador cada 7 días",
      "Coach de video 2 veces al mes",
      "Guía de edición por video",
    ],
  },
  pro: {
    name: "Pro",
    tagline: "Más videos y edición automática.",
    features: [
      "5 videos por semana (4 + 1 variante de prueba)",
      "2 carruseles por semana",
      "1 historia diaria sugerida",
      "Analizador cada 7 días",
      "Coach de video 8 veces al mes",
      "Edición automática: 20 al mes, menos de 60 s",
    ],
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return value === "basico" || value === "pro";
}
