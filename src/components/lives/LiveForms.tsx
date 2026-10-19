"use client";

import { useActionState, useState } from "react";
import { Button, cn, Field, FormError, TextAreaField } from "@/components/ui";
import { submitKeepingState } from "@/lib/form-submit";
import { generateWeekAction, requestSupportAction, saveAnswersAction, type LiveActionState } from "@/lib/lives/actions";
import { DAYS, PLATFORMS, SITUATIONS, type Situation } from "@/lib/lives/schemas";

const chip = "tap inline-flex cursor-pointer items-center rounded-full border px-4 text-sm font-semibold select-none";

/** Tarjeta de la primera pregunta (texto fijo de la app): ¿haces directos? */
export function AnswersForm() {
  const [state, action, pending] = useActionState<LiveActionState, FormData>(saveAnswersAction, undefined);
  const [sit, setSit] = useState<Situation | "">("");
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-4">
      <FormError message={state?.error} />
      <p className="font-extrabold">¿Haces directos?</p>
      <p className="text-sm text-ink-700">Un directo es transmitir en vivo (en TikTok, Instagram, YouTube…). Te ayudamos con temas y guías, y no te exigimos hacerlos.</p>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {SITUATIONS.map((s) => (
          <label key={s.id} className={cn(chip, sit === s.id ? "border-azul bg-azul text-blanco" : "border-ink-300 bg-blanco hover:bg-ink-100")}>
            <input type="radio" name="situacion" value={s.id} checked={sit === s.id} onChange={() => setSit(s.id)} className="sr-only" />
            {s.label}
          </label>
        ))}
      </div>

      {sit === "hace" && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">¿En qué app? (hasta 3)</legend>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <label key={p.id} className={cn(chip, "border-ink-300 bg-blanco has-[:checked]:border-azul has-[:checked]:bg-azul has-[:checked]:text-blanco")}>
                  <input type="checkbox" name="plataformas" value={p.id} className="sr-only" />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">¿Qué días?</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <label key={d} className={cn(chip, "border-ink-300 bg-blanco capitalize has-[:checked]:border-azul has-[:checked]:bg-azul has-[:checked]:text-blanco")}>
                  <input type="checkbox" name="dias" value={d} className="sr-only" />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="¿A qué hora?" name="hora" type="time" />
            <Field label="¿Cada cuánto? (opcional)" name="frecuencia" maxLength={80} placeholder="Ej. de lunes a viernes" />
          </div>
        </>
      )}

      {sit === "quiere_hacer" && (
        <>
          <p className="text-sm">No te preocupes: te damos temas desarrollados para que siempre tengas de qué hablar. Empezamos con un directo por semana.</p>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">¿En qué app te gustaría empezar?</legend>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <label key={p.id} className={cn(chip, "border-ink-300 bg-blanco has-[:checked]:border-azul has-[:checked]:bg-azul has-[:checked]:text-blanco")}>
                  <input type="checkbox" name="plataformas" value={p.id} className="sr-only" />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">¿Qué día te acomodaría?</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <label key={d} className={cn(chip, "border-ink-300 bg-blanco capitalize has-[:checked]:border-azul has-[:checked]:bg-azul has-[:checked]:text-blanco")}>
                  <input type="checkbox" name="dias" value={d} className="sr-only" />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
          <TextAreaField label="¿Cuándo harías un directo sí o sí?" name="compromiso" rows={2} maxLength={200} placeholder="Ej. los jueves por la noche, cuando ya acosté a mis hijos" />
        </>
      )}

      {sit === "no_quiere" && <p className="text-sm">Está bien, no es obligatorio. Te dejaremos una recomendación y, si algún día quieres, puedes pedir apoyo para un directo.</p>}

      <Button type="submit" disabled={pending || !sit} className="self-start">
        {pending ? "Guardando…" : "Continuar"}
      </Button>
    </form>
  );
}

export function GenerateWeekForm({ week, label }: { week: string; label: string }) {
  const [state, action, pending] = useActionState<LiveActionState, FormData>(generateWeekAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2">
      <FormError message={state?.error} />
      <input type="hidden" name="week" value={week} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Armando tu guía… (hasta un minuto)" : label}
      </Button>
    </form>
  );
}

export function SupportForm() {
  const [state, action, pending] = useActionState<LiveActionState, FormData>(requestSupportAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2">
      <FormError message={state?.error} />
      <Field label="¿Tienes un tema en mente? (opcional)" name="tema" maxLength={140} />
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending ? "Preparando… (hasta un minuto)" : "Pedir apoyo para un directo"}
      </Button>
    </form>
  );
}
