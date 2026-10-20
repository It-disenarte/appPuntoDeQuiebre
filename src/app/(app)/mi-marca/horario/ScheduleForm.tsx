"use client";

import { useActionState, useState } from "react";
import { Button, cn, FormError } from "@/components/ui";
import { saveScheduleAnswersAction, type BrujulaState } from "@/lib/brujula/actions";
import { submitKeepingState } from "@/lib/form-submit";
import { DAYS, DURATIONS, LIGHTS, MOMENTS, PLACES, type ScheduleAnswers } from "@/lib/brujula/schedule";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

type Opt = { value: string; label: string };
const chip = "tap inline-flex cursor-pointer items-center rounded-full border px-4 text-sm font-semibold select-none has-[:checked]:border-azul has-[:checked]:bg-azul has-[:checked]:text-blanco border-ink-300 bg-blanco text-ink-800 hover:bg-ink-100";

function Multi({ legend, name, options, defaults }: { legend: string; name: string; options: readonly Opt[]; defaults: string[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-ink-800">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className={chip}>
            <input type="checkbox" name={name} value={o.value} defaultChecked={defaults.includes(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ScheduleForm({ initial }: { initial: ScheduleAnswers | null }) {
  const [state, action, pending] = useActionState<BrujulaState, FormData>(saveScheduleAnswersAction, undefined);
  const [days, setDays] = useState<string[]>(initial?.dias.map((d) => d.dia) ?? []);
  const toggle = (c: string) => setDays((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const of = (c: string) => initial?.dias.find((d) => d.dia === c);

  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-6 rounded-card bg-blanco p-5 shadow-card lg:p-7">
      <FormError message={state?.error} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-ink-800">¿Qué días puedes grabar?</legend>
        <p className="text-xs text-ink-500">Elige varios, mínimo 2. Mejor 2 días seguros que 5 a medias.</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <label key={d.code} className={chip} aria-label={d.label}>
              <input type="checkbox" name="dias" value={d.code} checked={days.includes(d.code)} onChange={() => toggle(d.code)} className="sr-only" />
              {d.short}
            </label>
          ))}
        </div>
      </fieldset>

      {DAYS.filter((d) => days.includes(d.code)).map((d) => {
        const prev = of(d.code);
        return (
          <fieldset key={d.code} className="flex flex-col gap-3 rounded-xl bg-ink-100 p-4">
            <legend className="px-1 text-sm font-extrabold">{d.label}</legend>
            <Multi legend="¿En qué momento?" name={`momentos_${d.code}`} options={MOMENTS} defaults={prev?.momentos ?? []} />
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-800">
              ¿Cuánto tiempo ese día?
              <select name={`duracion_${d.code}`} defaultValue={String(prev?.duracion_min ?? 60)} className="h-12 rounded-xl border border-ink-300 bg-blanco px-4 text-base font-normal">
                {DURATIONS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 text-sm text-ink-700">
              <input type="checkbox" name={`aveces_${d.code}`} defaultChecked={prev?.a_veces_no ?? false} className="size-5 accent-azul" />A veces no puedo este día
            </label>
          </fieldset>
        );
      })}

      <Multi legend="¿Dónde grabas?" name="lugar" options={PLACES} defaults={initial?.lugar ?? []} />
      <Multi legend="¿Con qué luz cuentas?" name="luz" options={LIGHTS} defaults={initial?.luz ?? []} />

      <Button type="submit" size="lg" disabled={pending || days.length < 2} className="self-start">
        {pending && <LoadingOverlay title="Armando tu horario…" />}{pending ? "Armando tu horario…" : "Ver mi horario"}
      </Button>
      {days.length < 2 && <p className={cn("-mt-3 text-xs text-ink-500")}>Elige al menos 2 días.</p>}
    </form>
  );
}
