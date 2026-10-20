"use client";

import { useActionState, useState } from "react";
import { Button, cn, Field, FormError } from "@/components/ui";
import { generatePlanAction, type PlanActionState } from "@/lib/plan/actions";
import { submitKeepingState } from "@/lib/form-submit";
import { STORY_LIBRARY } from "@/lib/plan/mock";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

/** "Generar mi semana", con la tarjeta de enfoque de las historias (de 1 a 3 temas y tipos que no quiere ver). */
export function GenerateWeek({ week, topics, label }: { week: string; topics: string[]; label: string }) {
  const [state, action, pending] = useActionState<PlanActionState, FormData>(generatePlanAction, undefined);
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (t: string) => setPicked((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < 3 ? [...cur, t] : cur));

  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-5">
      <FormError message={state?.error} />
      <input type="hidden" name="week" value={week} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-ink-800">¿De qué quieres que hablen tus historias esta semana? (de 1 a 3, opcional)</legend>
        <div className="flex flex-wrap gap-2">
          {topics.map((t) => {
            const on = picked.includes(t);
            return (
              <label key={t} className={cn("tap inline-flex cursor-pointer items-center rounded-full border px-4 text-sm font-semibold select-none", on ? "border-azul bg-azul text-blanco" : "border-ink-300 bg-blanco text-ink-800 hover:bg-ink-100", !on && picked.length >= 3 && "opacity-50")}>
                <input type="checkbox" name="temas" value={t} checked={on} onChange={() => toggle(t)} className="sr-only" />
                {t}
              </label>
            );
          })}
        </div>
        <Field label="Otro tema (opcional)" name="otro" maxLength={40} />
      </fieldset>
      <details className="rounded-xl bg-ink-100 p-3">
        <summary className="cursor-pointer text-sm font-semibold">¿Algún tipo de historia que no quieras ver? (se apaga 4 semanas)</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {STORY_LIBRARY.map((t) => (
            <label key={t.tipo} className="tap inline-flex cursor-pointer items-center rounded-full border border-ink-300 bg-blanco px-3 text-xs font-semibold has-[:checked]:border-alerta has-[:checked]:bg-alerta-100 has-[:checked]:text-alerta">
              <input type="checkbox" name="apagar" value={t.tipo} className="sr-only" />
              {t.tipo}
            </label>
          ))}
        </div>
      </details>
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending && <LoadingOverlay title="Armando tu semana…" />}{pending ? "Armando tu semana…" : label}
      </Button>
      <p className="text-xs text-ink-500">Tarda unos segundos: escribimos el guion de cada pieza con tu voz.</p>
    </form>
  );
}
