"use client";

import { useActionState } from "react";
import { Button, Field, FormError } from "@/components/ui";
import { addCompetitorAction, startRunAction, type AnalyzerActionState } from "@/lib/analyzer/actions";
import { submitKeepingState } from "@/lib/form-submit";

export function AddCompetitorForm() {
  const [state, action, pending] = useActionState<AnalyzerActionState, FormData>(addCompetitorAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2">
      <FormError message={state?.error} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field label="Agregar una cuenta" name="usuario" placeholder="@usuario" maxLength={80} />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Agregando…" : "Agregar"}
        </Button>
      </div>
    </form>
  );
}

export function StartRunForm({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState<AnalyzerActionState, FormData>(startRunAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2">
      <FormError message={state?.error} />
      <Button type="submit" size="lg" disabled={pending || disabled} className="self-start">
        {pending ? "Empezando…" : "Analizar a mi competencia"}
      </Button>
    </form>
  );
}
