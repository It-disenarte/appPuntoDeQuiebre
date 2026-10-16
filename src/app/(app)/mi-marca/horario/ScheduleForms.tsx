"use client";

import { useActionState } from "react";
import { Button, FormError, SelectField } from "@/components/ui";
import { adjustScheduleAction, saveScheduleAnswersAction, type BrujulaState } from "@/lib/brujula/actions";
import { DAYS, SCHEDULE_QUESTIONS, type ScheduleAnswers, type ScheduleBlock } from "@/lib/brujula/schedule";

type Opt = { value: string; label: string };

function Choice({ legend, hint, name, type, options, checked }: { legend: string; hint?: string; name: string; type: "radio" | "checkbox"; options: readonly Opt[]; checked: string[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-ink-800">{legend}</legend>
      {hint && <p className="text-xs text-ink-500">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="tap inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink-300 bg-blanco px-4 text-sm font-semibold has-[:checked]:border-azul has-[:checked]:bg-azul has-[:checked]:text-blanco">
            <input type={type} name={name} value={o.value} defaultChecked={checked.includes(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ScheduleQuestions({ initial }: { initial: ScheduleAnswers | null }) {
  const [state, action, pending] = useActionState<BrujulaState, FormData>(saveScheduleAnswersAction, undefined);
  const f = state?.fields;
  const pick = (k: keyof ScheduleAnswers): string[] => {
    const v = f?.[k] ?? initial?.[k];
    return Array.isArray(v) ? v : v ? [v] : [];
  };
  const Q = SCHEDULE_QUESTIONS;
  return (
    <form action={action} className="flex flex-col gap-5 rounded-card bg-blanco p-5 shadow-card lg:p-7">
      <FormError message={state?.error} />
      <Choice legend={Q.days.label} hint={Q.days.hint} name="days" type="checkbox" options={Q.days.options} checked={pick("days")} />
      <Choice legend={Q.moment.label} name="moment" type="radio" options={Q.moment.options} checked={pick("moment")} />
      <Choice legend={Q.duration.label} name="duration" type="radio" options={Q.duration.options} checked={pick("duration")} />
      <Choice legend={Q.place.label} name="place" type="radio" options={Q.place.options} checked={pick("place")} />
      <Choice legend={Q.light.label} name="light" type="radio" options={Q.light.options} checked={pick("light")} />
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Armando tu propuesta…" : "Ver mi propuesta"}
      </Button>
    </form>
  );
}

export function AdjustForm({ blocks, times }: { blocks: ScheduleBlock[]; times: string[] }) {
  const [state, action, pending] = useActionState<BrujulaState, FormData>(adjustScheduleAction, undefined);
  const dayOptions = Object.fromEntries(DAYS.map((d) => [d.value, d.label]));
  const timeOptions = Object.fromEntries(times.map((t) => [t, `${t} h`]));
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state?.error} />
      {blocks.map((b, i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          <SelectField label={b.kind === "respaldo" ? "Día de respaldo" : `Bloque ${i + 1}`} name={`day_${i}`} options={dayOptions} defaultValue={b.day} />
          <SelectField label="Hora de inicio" name={`start_${i}`} options={timeOptions} defaultValue={b.start} />
        </div>
      ))}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Guardar mi ajuste"}
      </Button>
    </form>
  );
}
