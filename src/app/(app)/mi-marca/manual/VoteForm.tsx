"use client";

import { useActionState, useState } from "react";
import { Button, cn, FormError } from "@/components/ui";
import { submitKeepingState } from "@/lib/form-submit";
import { voteSectionAction, type BrujulaState } from "@/lib/brujula/actions";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

type Vote = "ajustar" | "no" | null;

/** Calificación de una sección: 👍 la aprueba; ✏️ ajuste corto (máx. 120 caracteres); 👎 no me representa (nota obligatoria). */
export function VoteForm({ section, adjustmentsLeft }: { section: string; adjustmentsLeft: number }) {
  const [state, action, pending] = useActionState<BrujulaState, FormData>(voteSectionAction, undefined);
  const [open, setOpen] = useState<Vote>(null);
  const note = typeof state?.fields?.note === "string" ? state.fields.note : "";
  const canAdjust = adjustmentsLeft > 0;

  return (
    <div className="flex flex-col gap-3">
      <FormError message={state?.error} />
      <div className="flex flex-wrap gap-2">
        <form onSubmit={submitKeepingState(action)}>
          <input type="hidden" name="section" value={section} />
          <input type="hidden" name="vote" value="si" />
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            👍 Me gusta
          </Button>
        </form>
        <Button type="button" variant="outline" size="sm" disabled={!canAdjust} aria-pressed={open === "ajustar"} onClick={() => setOpen(open === "ajustar" ? null : "ajustar")}>
          ✏️ Ajuste corto
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!canAdjust} aria-pressed={open === "no"} onClick={() => setOpen(open === "no" ? null : "no")}>
          👎 No me representa
        </Button>
      </div>
      {!canAdjust && <p className="text-xs text-ink-500">Ya usaste los 3 ajustes de esta sección. Aprueba esta versión para continuar.</p>}
      {open && (
        <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2">
          <input type="hidden" name="section" value={section} />
          <input type="hidden" name="vote" value={open} />
          <label htmlFor={`note-${section}`} className="text-sm font-semibold text-ink-800">
            {open === "ajustar" ? "¿Qué detalle cambiarías?" : "¿Qué no te representa?"}
          </label>
          <input
            id={`note-${section}`}
            name="note"
            defaultValue={note}
            required
            maxLength={open === "ajustar" ? 120 : 300}
            className={cn("h-12 rounded-xl border border-ink-300 bg-blanco px-4 text-base outline-none focus:border-azul focus:ring-4 focus:ring-azul/15")}
          />
          <p className="text-xs text-ink-500">{open === "ajustar" ? "Máximo 120 caracteres. Solo cambiamos lo que pidas." : "Reescribimos esta sección con tu nota."} Te quedan {adjustmentsLeft} ajuste(s) en esta sección.</p>
          <Button type="submit" size="sm" disabled={pending} className="self-start">
            {pending && <LoadingOverlay title="Ajustando…" />}{pending ? "Ajustando…" : "Enviar"}
          </Button>
        </form>
      )}
    </div>
  );
}
