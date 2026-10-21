import "server-only";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/settings";

/**
 * Límites y precios que el administrador puede cambiar sin tocar código (guardados en app_settings).
 * Hoy solo el intervalo del analizador se aplica en la app; el resto queda registrado para cuando existan esas funciones.
 */
export const limitsSchema = z.object({
  analyzerIntervalDays: z.number().int().min(1).max(60),
  analyzerTopK: z.number().int().min(1).max(3),
  coachMonthlyBasico: z.number().int().min(0).max(100),
  coachMonthlyPro: z.number().int().min(0).max(100),
  editsMonthlyPro: z.number().int().min(0).max(200),
  trendsWeeklyBasico: z.number().int().min(0).max(50),
  trendsWeeklyPro: z.number().int().min(0).max(50),
  aiImagesMonthlyBasico: z.number().int().min(0).max(500),
  aiImagesMonthlyPro: z.number().int().min(0).max(500),
});
export type Limits = z.infer<typeof limitsSchema>;
export const DEFAULT_LIMITS: Limits = { analyzerIntervalDays: 7, analyzerTopK: 2, coachMonthlyBasico: 2, coachMonthlyPro: 8, editsMonthlyPro: 20, trendsWeeklyBasico: 3, trendsWeeklyPro: 5, aiImagesMonthlyBasico: 15, aiImagesMonthlyPro: 60 };

/** Precios para ESTIMAR el costo de IA (en dólares por millón de tokens o por llamada). Ajústalos con tu factura real. */
export const pricesSchema = z.object({
  claudeInUsdPerM: z.number().min(0).max(1000),
  claudeOutUsdPerM: z.number().min(0).max(1000),
  geminiCallUsd: z.number().min(0).max(10),
  geminiImageUsd: z.number().min(0).max(10),
  apifyRunUsd: z.number().min(0).max(100),
  usdMxn: z.number().min(1).max(100),
});
export type Prices = z.infer<typeof pricesSchema>;
export const DEFAULT_PRICES: Prices = { claudeInUsdPerM: 3, claudeOutUsdPerM: 15, geminiCallUsd: 0.01, geminiImageUsd: 0.04, apifyRunUsd: 0.5, usdMxn: 18 };

const KEYS = { limits: "admin_limits", prices: "admin_prices" } as const;

export async function getLimits(): Promise<Limits> {
  const r = limitsSchema.safeParse({ ...DEFAULT_LIMITS, ...((await getSetting<Record<string, unknown>>(KEYS.limits)) ?? {}) });
  return r.success ? r.data : DEFAULT_LIMITS;
}
export async function getPrices(): Promise<Prices> {
  const r = pricesSchema.safeParse({ ...DEFAULT_PRICES, ...((await getSetting<Record<string, unknown>>(KEYS.prices)) ?? {}) });
  return r.success ? r.data : DEFAULT_PRICES;
}
export async function saveLimits(v: unknown, adminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = limitsSchema.safeParse(v);
  if (!r.success) return { ok: false, error: "Revisa los límites: deben ser números enteros dentro de un rango razonable." };
  await setSetting(KEYS.limits, r.data, adminId);
  return { ok: true };
}
export async function savePrices(v: unknown, adminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = pricesSchema.safeParse(v);
  if (!r.success) return { ok: false, error: "Revisa los precios: deben ser números positivos." };
  await setSetting(KEYS.prices, r.data, adminId);
  return { ok: true };
}
