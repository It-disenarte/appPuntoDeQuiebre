"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, Chip, cn, Field, FormError } from "@/components/ui";
import { checkoutAction, type ActionState } from "@/lib/account/actions";
import { PLANS, type PlanId } from "@/lib/plans";

export function PlanPicker({ priceLabels, initialCode }: { priceLabels: Partial<Record<PlanId, string>>; initialCode?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(checkoutAction, undefined);
  const [plan, setPlan] = useState<PlanId>("basico");

  return (
    <form action={action} className="flex flex-col gap-5">
      <FormError message={state?.error} />
      <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <legend className="sr-only">Plan</legend>
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          const selected = plan === id;
          return (
            <label
              key={id}
              className={cn(
                "tap relative flex cursor-pointer flex-col rounded-card bg-blanco p-5 shadow-card ring-2",
                selected ? "ring-azul" : "ring-transparent hover:ring-ink-300",
              )}
            >
              <input type="radio" name="plan" value={id} checked={selected} onChange={() => setPlan(id)} className="sr-only" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-3xl">{p.name}</p>
                  <p className="mt-1 text-sm text-ink-500">{p.tagline}</p>
                </div>
                {id === "basico" && <Chip tone="naranja">Con código: 30 días gratis</Chip>}
              </div>
              <p className="mt-4 text-xl font-extrabold">{priceLabels[id] ?? "Precio por confirmar"}</p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-ink-700">
                {p.features.slice(0, 3).map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-azul" aria-hidden /> {f}
                  </li>
                ))}
              </ul>
              {p.features.length > 3 && (
                <details className="mt-3 text-sm text-ink-700" onClick={(e) => e.stopPropagation()}>
                  <summary className="cursor-pointer font-semibold text-azul">Ver todo lo que incluye</summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {p.features.slice(3).map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-azul" aria-hidden /> {f}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </label>
          );
        })}
      </fieldset>

      <div className="flex flex-col gap-4">
        {initialCode ? (
          <input type="hidden" name="code" value={state?.fields?.code ?? initialCode} />
        ) : (
          <details open={Boolean(state?.fields?.code)} className="rounded-xl bg-ink-100 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink-800">¿Tienes un código?</summary>
            <div className="mt-3">
              <Field label="Código del webinar o de descuento" name="code" autoCapitalize="characters" spellCheck={false} maxLength={40} defaultValue={state?.fields?.code} />
            </div>
          </details>
        )}
        <Button type="submit" size="lg" disabled={pending} className="w-full md:w-auto">
          {pending ? "Abriendo pago…" : `Continuar con ${PLANS[plan].name}`}
        </Button>
      </div>
      <p className="text-sm text-ink-500">Registras tu tarjeta en Stripe. Con código de prueba, el primer cobro es al día 31. Cancelas cuando quieras.</p>
    </form>
  );
}
