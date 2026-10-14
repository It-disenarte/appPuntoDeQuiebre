"use client";

import { useActionState } from "react";
import { Button, CheckboxField, cn, FormError } from "@/components/ui";
import { acceptCommitmentAction, type ActionState } from "@/lib/account/actions";

type Question = { id: string; question: string; options: { id: string; text: string }[] };

export function CommitmentForm({ questions, hints }: { questions: Question[]; hints: Record<string, string> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acceptCommitmentAction, undefined);
  const wrong = new Set(state?.wrong ?? []);

  return (
    <form action={action} className="flex flex-col gap-5 rounded-card bg-blanco p-5 shadow-card lg:p-7">
      <h2 className="font-display text-3xl">Comprueba que quedó claro</h2>
      <FormError message={state?.error} />
      {questions.map((q) => (
        <fieldset key={q.id} className={cn("flex flex-col gap-2 rounded-xl p-3", wrong.has(q.id) && "bg-alerta-100")}>
          <legend className="font-semibold">{q.question}</legend>
          {q.options.map((o) => (
            <label key={o.id} className="tap flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-ink-100">
              <input
                type="radio"
                name={q.id}
                value={o.id}
                required
                defaultChecked={state?.fields?.[q.id] === o.id}
                className="size-5 accent-azul"
              />
              {o.text}
            </label>
          ))}
          {wrong.has(q.id) && <p className="text-sm font-semibold text-alerta">{hints[q.id]}</p>}
        </fieldset>
      ))}
      <CheckboxField name="accept" required label={<strong>Acepto el compromiso: aparecer en cámara, grabar 2 veces por semana y no rendirme en los primeros 90 días.</strong>} />
      <Button type="submit" size="lg" variant="accent" disabled={pending} className="w-full">
        {pending ? "Guardando…" : "Acepto el compromiso"}
      </Button>
    </form>
  );
}
