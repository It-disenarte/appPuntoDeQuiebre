import { addDays, DAY_NAMES } from "@/lib/plan/rules";

/** Los 7 días de una semana (lunes a domingo) con su nombre en minúsculas, como los guarda la guía. */
export function getPlanDays(weekStart: string): { iso: string; name: string }[] {
  return DAY_NAMES.map((n, i) => ({ iso: addDays(weekStart, i), name: n.toLowerCase() }));
}
export { addDays, DAY_NAMES };
