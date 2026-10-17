"use client";

import { useActionState } from "react";
import { Button, FormError, TextAreaField } from "@/components/ui";
import { regenerateAction, type CarouselActionState } from "@/lib/carousel/actions";
import { submitKeepingState } from "@/lib/form-submit";

/** Nivel 3: rehacer TODO el carrusel con una nota (máximo 2 veces; la versión anterior se conserva hasta que llegue la nueva). */
export function RegenerateForm({ id, left }: { id: string; left: number }) {
  const [state, action, pending] = useActionState<CarouselActionState, FormData>(regenerateAction, undefined);
  return (
    <details className="rounded-card bg-blanco p-4 shadow-card">
      <summary className="cursor-pointer text-sm font-semibold text-azul">El carrusel completo no me convence ({left} {left === 1 ? "intento" : "intentos"})</summary>
      <form onSubmit={submitKeepingState(action)} className="mt-3 flex flex-col gap-2">
        <FormError message={state?.error} />
        <p className="text-xs text-ink-500">Antes de rehacer todo, revisa si el problema es de pocos slides: puedes rehacerlos de uno en uno.</p>
        <input type="hidden" name="id" value={id} />
        <TextAreaField label="¿Qué quieres distinto?" name="nota" rows={2} maxLength={300} required />
        <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
          {pending ? "Rehaciendo… (hasta un minuto)" : "Rehacer todo el carrusel"}
        </Button>
      </form>
    </details>
  );
}
