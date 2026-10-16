"use client";

import { useActionState, useState } from "react";
import { Button, cn, Field, FormError, SelectField, TextAreaField } from "@/components/ui";
import { saveBlockAction, type BrujulaState } from "@/lib/brujula/actions";
import type { AnswerValue, BlockDef, FieldDef } from "@/lib/brujula/content";

function MultiField({ field, value, error }: { field: FieldDef; value: string[]; error?: string }) {
  const [selected, setSelected] = useState<string[]>(value);
  const max = field.maxChoices ?? field.options!.length;
  const toggle = (v: string) => setSelected((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : cur.length < max ? [...cur, v] : cur));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-ink-800">{field.label}</legend>
      <div className="flex flex-wrap gap-2">
        {field.options!.map((o) => {
          const on = selected.includes(o.value);
          return (
            <label
              key={o.value}
              className={cn(
                "tap inline-flex cursor-pointer items-center rounded-full border px-4 text-sm font-semibold select-none",
                on ? "border-azul bg-azul text-blanco" : "border-ink-300 bg-blanco text-ink-800 hover:bg-ink-100",
                !on && selected.length >= max && "opacity-50",
              )}
            >
              <input type="checkbox" name={field.id} value={o.value} checked={on} onChange={() => toggle(o.value)} className="sr-only" />
              {o.label}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-ink-500">
        {selected.length} de {max} elegidos
      </p>
      {error && <p className="text-sm font-semibold text-alerta">{error}</p>}
    </fieldset>
  );
}

export function BlockForm({ block, initial, isLast }: { block: BlockDef; initial: Record<string, AnswerValue>; isLast: boolean }) {
  const [state, action, pending] = useActionState<BrujulaState, FormData>(saveBlockAction, undefined);
  const values = state?.fields ?? initial;
  const errors = state?.errors ?? {};
  const text = (id: string) => (typeof values[id] === "string" ? (values[id] as string) : "");

  return (
    <form action={action} className="flex flex-col gap-5 rounded-card bg-blanco p-5 shadow-card lg:p-7" noValidate>
      <input type="hidden" name="block" value={block.id} />
      <FormError message={state?.error} />
      {block.fields.map((f) => {
        const err = errors[f.id];
        const common = { label: f.required ? f.label : `${f.label} (opcional)`, name: f.id, "aria-invalid": err ? true : undefined } as const;
        const errorLine = err && <p className="text-sm font-semibold text-alerta">{err}</p>;
        if (f.kind === "multi") return <MultiField key={f.id} field={f} value={Array.isArray(values[f.id]) ? (values[f.id] as string[]) : []} error={err} />;
        if (f.kind === "textarea")
          return (
            <div key={f.id} className="flex flex-col gap-1.5">
              <TextAreaField {...common} defaultValue={text(f.id)} maxLength={f.max} />
              {f.hint && <p className="text-xs text-ink-500">{f.hint}</p>}
              {errorLine}
            </div>
          );
        if (f.kind === "select") {
          const options = Object.fromEntries(f.options!.map((o) => [o.value, o.label]));
          return (
            <div key={f.id} className="flex flex-col gap-1.5">
              <SelectField {...common} options={options} placeholder="Elige una opción" defaultValue={text(f.id)} hint={f.hint} />
              {errorLine}
            </div>
          );
        }
        return (
          <div key={f.id} className="flex flex-col gap-1.5">
            <Field
              {...common}
              defaultValue={text(f.id)}
              maxLength={f.max}
              hint={f.hint}
              placeholder={f.placeholder}
              {...(f.kind === "number" ? { type: "text", inputMode: "numeric" as const } : {})}
            />
            {errorLine}
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-500">Se guarda al continuar. Puedes pausar cuando quieras.</p>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Guardando…" : isLast ? "Guardar y terminar" : "Guardar y seguir"}
        </Button>
      </div>
    </form>
  );
}
