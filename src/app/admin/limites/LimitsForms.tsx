"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormSuccess } from "@/components/ui";
import { saveLimitsAction, savePricesAction, type AdminState } from "@/lib/admin/actions";
import type { Limits, Prices } from "@/lib/admin/limits";

export function LimitsForm({ v }: { v: Limits }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveLimitsAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-card bg-blanco p-5 shadow-card">
      <h2 className="text-sm font-extrabold">Límites de uso</h2>
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Analizador: días entre usos" name="analyzerIntervalDays" type="number" min={1} max={60} defaultValue={v.analyzerIntervalDays} hint="Se aplica ya." />
        <Field label="Analizador: videos por cuenta" name="analyzerTopK" type="number" min={1} max={3} defaultValue={v.analyzerTopK} hint="Se aplica ya (cada video analizado cuesta)." />
        <span />
        <Field label="Coach al mes · Básico" name="coachMonthlyBasico" type="number" min={0} max={100} defaultValue={v.coachMonthlyBasico} hint="Se usará cuando exista el coach." />
        <Field label="Coach al mes · Pro" name="coachMonthlyPro" type="number" min={0} max={100} defaultValue={v.coachMonthlyPro} />
        <Field label="Ediciones al mes · Pro" name="editsMonthlyPro" type="number" min={0} max={200} defaultValue={v.editsMonthlyPro} hint="Se usará con la edición automática." />
        <Field label="Tendencias por semana · Básico" name="trendsWeeklyBasico" type="number" min={0} max={50} defaultValue={v.trendsWeeklyBasico} />
        <Field label="Tendencias por semana · Pro" name="trendsWeeklyPro" type="number" min={0} max={50} defaultValue={v.trendsWeeklyPro} />
        <Field label="Imágenes con IA al mes · Básico" name="aiImagesMonthlyBasico" type="number" min={0} max={500} defaultValue={v.aiImagesMonthlyBasico} hint="Se aplica ya (0 = no incluidas)." />
        <Field label="Imágenes con IA al mes · Pro" name="aiImagesMonthlyPro" type="number" min={0} max={500} defaultValue={v.aiImagesMonthlyPro} />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Guardar límites"}
      </Button>
    </form>
  );
}

export function PricesForm({ v }: { v: Prices }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(savePricesAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-card bg-blanco p-5 shadow-card">
      <h2 className="text-sm font-extrabold">Precios para estimar el costo de IA</h2>
      <p className="text-xs text-ink-500">Son estimaciones: ajústalas con lo que te cobran Anthropic, Google y Apify. No es tu factura real.</p>
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Claude: USD por millón de tokens de entrada" name="claudeInUsdPerM" type="number" step="0.01" min={0} defaultValue={v.claudeInUsdPerM} />
        <Field label="Claude: USD por millón de tokens de salida" name="claudeOutUsdPerM" type="number" step="0.01" min={0} defaultValue={v.claudeOutUsdPerM} />
        <Field label="Gemini: USD por llamada (imagen o video)" name="geminiCallUsd" type="number" step="0.001" min={0} defaultValue={v.geminiCallUsd} />
        <Field label="Gemini: USD por imagen creada" name="geminiImageUsd" type="number" step="0.001" min={0} defaultValue={v.geminiImageUsd} />
        <Field label="Apify: USD por cuenta analizada" name="apifyRunUsd" type="number" step="0.01" min={0} defaultValue={v.apifyRunUsd} />
        <Field label="Tipo de cambio USD → MXN" name="usdMxn" type="number" step="0.01" min={1} defaultValue={v.usdMxn} />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Guardar precios"}
      </Button>
    </form>
  );
}
