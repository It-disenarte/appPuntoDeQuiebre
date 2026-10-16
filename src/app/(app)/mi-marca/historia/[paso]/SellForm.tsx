"use client";

import { useActionState, useState } from "react";
import { Button, cn, Field, FormError } from "@/components/ui";
import { saveSellAction, skipStepAction, type BrujulaState } from "@/lib/brujula/actions";
import { SELL_OPTIONS } from "@/lib/brujula/content";
import { submitKeepingState } from "@/lib/form-submit";

export function SellForm({ initialMode, initialText }: { initialMode: string; initialText: string }) {
  const [state, action, pending] = useActionState<BrujulaState, FormData>(saveSellAction, undefined);
  const [mode, setMode] = useState(typeof state?.fields?.mode === "string" ? state.fields.mode : initialMode);
  const text = typeof state?.fields?.text === "string" ? state.fields.text : initialText;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-4">
        <FormError message={state?.error} />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-ink-800">Elige una opción</legend>
          <div className="flex flex-wrap gap-2">
            {SELL_OPTIONS.map((o) => (
              <label
                key={o.value}
                className={cn(
                  "tap inline-flex cursor-pointer items-center rounded-full border px-4 text-sm font-semibold select-none",
                  mode === o.value ? "border-azul bg-azul text-blanco" : "border-ink-300 bg-blanco text-ink-800 hover:bg-ink-100",
                )}
              >
                <input type="radio" name="mode" value={o.value} checked={mode === o.value} onChange={() => setMode(o.value)} className="sr-only" />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        {(mode === "hoy" || mode === "despues") && <Field label="¿Qué vendes o qué te gustaría vender?" name="text" defaultValue={text} maxLength={300} />}
        <Button type="submit" size="lg" disabled={pending || !mode} className="self-start">
          {pending ? "Guardando…" : "Continuar"}
        </Button>
      </form>
      <form action={skipStepAction} className="self-start">
        <input type="hidden" name="step" value="que_vendes" />
        <button type="submit" className="tap text-sm font-semibold text-ink-600 underline underline-offset-4">
          Saltar esta pregunta
        </button>
      </form>
    </div>
  );
}
