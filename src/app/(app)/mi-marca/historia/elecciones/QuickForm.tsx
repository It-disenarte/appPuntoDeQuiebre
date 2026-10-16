"use client";

import { useActionState, useState } from "react";
import { Button, cn, Field, FormError } from "@/components/ui";
import { saveQuickAction, type BrujulaState } from "@/lib/brujula/actions";
import { submitKeepingState } from "@/lib/form-submit";
import { FORMATS, MAX_REFERENTS, MIN_REFERENTS, NETWORKS, TONES, type Quick } from "@/lib/brujula/content";

type Opt = { value: string; label: string };

function Chips({ legend, hint, name, options, initial, max }: { legend: string; hint?: string; name: string; options: Opt[]; initial: string[]; max?: number }) {
  const [selected, setSelected] = useState<string[]>(initial);
  const limit = max ?? options.length;
  const toggle = (v: string) => setSelected((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : cur.length < limit ? [...cur, v] : cur));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-ink-800">{legend}</legend>
      {hint && <p className="text-xs text-ink-500">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <label
              key={o.value}
              className={cn(
                "tap inline-flex cursor-pointer items-center rounded-full border px-4 text-sm font-semibold select-none",
                on ? "border-azul bg-azul text-blanco" : "border-ink-300 bg-blanco text-ink-800 hover:bg-ink-100",
                !on && selected.length >= limit && "opacity-50",
              )}
            >
              <input type="checkbox" name={name} value={o.value} checked={on} onChange={() => toggle(o.value)} className="sr-only" />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function QuickForm({ initial }: { initial: Quick | null }) {
  const [state, action, pending] = useActionState<BrujulaState, FormData>(saveQuickAction, undefined);
  const f = state?.fields;
  const arr = (k: keyof Quick): string[] => {
    const v = f?.[k] ?? initial?.[k];
    return Array.isArray(v) ? v : [];
  };
  const refs = arr("referentes");
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-6 rounded-card bg-blanco p-5 shadow-card lg:p-7">
      <FormError message={state?.error} />
      <Chips legend="¿En qué redes publicas?" name="redes" options={NETWORKS} initial={arr("redes")} />
      <Chips legend="¿Qué formatos te gustan?" hint="Elige todos los que quieras; el primero será tu formato principal." name="formatos" options={FORMATS} initial={arr("formatos")} />
      <Chips legend="¿Cómo quieres sonar?" hint="Elige hasta 3." name="tono" options={TONES} initial={arr("tono")} max={3} />
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-ink-800">Cuentas que te inspiran</legend>
        <p className="text-xs text-ink-500">
          Escribe su usuario o enlace. Mínimo {MIN_REFERENTS}, hasta {MAX_REFERENTS}. Solo nos sirven de orientación: nunca copiamos su contenido.
        </p>
        {Array.from({ length: MAX_REFERENTS }, (_, i) => (
          <Field key={i} label={`Cuenta ${i + 1}${i < MIN_REFERENTS ? "" : " (opcional)"}`} name="referentes" defaultValue={refs[i] ?? ""} maxLength={120} placeholder="@usuario" />
        ))}
      </fieldset>
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Guardar y armar mi brújula"}
      </Button>
    </form>
  );
}
