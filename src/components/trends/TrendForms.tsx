"use client";

import { useActionState } from "react";
import { Button, FormError, SelectField, TextAreaField } from "@/components/ui";
import { submitKeepingState } from "@/lib/form-submit";
import { chooseTrendAction, refreshUseAction, requestUseAction, type TrendActionState } from "@/lib/trends/actions";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

export function RequestForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<TrendActionState, FormData>(requestUseAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2">
      <FormError message={state?.error} />
      <Button type="submit" disabled={pending || disabled} className="self-start">
        {pending && <LoadingOverlay title="Buscando ideas… (hasta un minuto)" />}{pending ? "Buscando ideas… (hasta un minuto)" : "Ver tendencias"}
      </Button>
    </form>
  );
}

export function RefreshForm({ useId }: { useId: string }) {
  const [state, action, pending] = useActionState<TrendActionState, FormData>(refreshUseAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2 rounded-xl bg-ink-100 p-3">
      <FormError message={state?.error} />
      <input type="hidden" name="uso" value={useId} />
      <TextAreaField id={`nota-${useId}`} label="Ninguna me convence porque…" name="nota" rows={2} maxLength={300} required />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending && <LoadingOverlay title="Buscando otras…" />}{pending ? "Buscando otras…" : "Dame otras ideas (no gasta tu consulta)"}
      </Button>
    </form>
  );
}

export function ChooseForm({ useId, options }: { useId: string; options: Record<string, string> }) {
  const [state, action, pending] = useActionState<TrendActionState, FormData>(chooseTrendAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2 rounded-xl bg-ink-100 p-3">
      <FormError message={state?.error} />
      <input type="hidden" name="uso" value={useId} />
      <SelectField id={`sel-${useId}`} label="O elige una tendencia de la lista" name="tendencia" options={options} placeholder="Elige una…" required />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending && <LoadingOverlay title="Armando…" />}{pending ? "Armando…" : "Armar mi idea con esta"}
      </Button>
    </form>
  );
}
