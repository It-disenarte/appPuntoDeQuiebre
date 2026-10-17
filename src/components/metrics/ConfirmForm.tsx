"use client";

import { useActionState } from "react";
import { Button, Field, FormError } from "@/components/ui";
import { confirmReportAction, type MetricsActionState } from "@/lib/metrics/actions";
import { submitKeepingState } from "@/lib/form-submit";
import { KEY_FIELDS } from "@/lib/metrics/schemas";

/** Paso de revisión: la IA pudo leer mal un número, así que el creador confirma o corrige antes de explicar. */
export function ConfirmForm({ period, values }: { period: string; values: Record<string, number | null | undefined> }) {
  const [state, action, pending] = useActionState<MetricsActionState, FormData>(confirmReportAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-4 rounded-card bg-blanco p-5 shadow-card">
      <FormError message={state?.error} />
      <input type="hidden" name="periodo" value={period} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {KEY_FIELDS.map((f) => (
          <Field key={f.id} label={f.label} name={f.id} inputMode="decimal" defaultValue={values[f.id] ?? ""} hint={f.hint} placeholder="Si no aparece, déjalo vacío" />
        ))}
      </div>
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Armando tu informe…" : "Están bien, explícame"}
      </Button>
    </form>
  );
}
