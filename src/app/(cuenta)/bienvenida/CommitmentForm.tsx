"use client";

import { useActionState, useState } from "react";
import { Button, CheckboxField, FormError } from "@/components/ui";
import { acceptCommitmentAction, type ActionState } from "@/lib/account/actions";

type Slide = { title: string; body: string; resalta?: readonly string[] };

/** El título con algunas palabras subrayadas en el naranja de la marca. */
function Titulo({ text, resalta = [] }: { text: string; resalta?: readonly string[] }) {
  const esc = resalta.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (esc.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${esc.join("|")})`, "i"));
  return (
    <>
      {parts.map((p, i) =>
        resalta.some((w) => w.toLowerCase() === p.toLowerCase()) ? (
          <span key={i} className="underline decoration-naranja decoration-[0.14em] underline-offset-[0.14em]">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Bienvenida paso a paso: el video de Erick, una idea por pantalla y un solo compromiso al final. */
export function Welcome({ slides, hasVideo }: { slides: Slide[]; hasVideo: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acceptCommitmentAction, undefined);
  const [step, setStep] = useState(0);
  const total = slides.length + 2; // video + ideas + compromiso
  const last = step === total - 1;
  const slide = step >= 1 && step <= slides.length ? slides[step - 1]! : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1.5" aria-label={`Paso ${step + 1} de ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-azul" : "bg-ink-200"}`} />
        ))}
      </div>

      {step === 0 && (
        <section className="overflow-hidden rounded-card bg-negro">
          {hasVideo ? (
            <video controls playsInline preload="metadata" className="aspect-video w-full bg-negro" src="/api/media/bienvenida">
              Tu navegador no puede reproducir este video.
            </video>
          ) : (
            <div className="grid aspect-video place-items-center p-6 text-center text-ink-300">
              <p>Aquí va el video de presentación de Erick.</p>
            </div>
          )}
        </section>
      )}

      {slide && (
        <section className="flex min-h-48 flex-col justify-center gap-3 rounded-card bg-blanco p-6 shadow-card">
          <h2 className="font-display text-3xl">
            <Titulo text={slide.title} resalta={slide.resalta} />
          </h2>
          <p className="text-ink-700">{slide.body}</p>
        </section>
      )}

      {last && (
        <form action={action} className="flex flex-col gap-4 rounded-card bg-blanco p-6 shadow-card">
          <h2 className="font-display text-3xl">Un último paso</h2>
          <FormError message={state?.error} />
          <CheckboxField name="accept" required label={<strong>Me comprometo a aparecer en cámara, grabar 2 veces por semana y no rendirme en los primeros 90 días.</strong>} />
          <Button type="submit" size="lg" variant="accent" disabled={pending} className="w-full">
            {pending ? "Guardando…" : "Empezar"}
          </Button>
        </form>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Atrás
        </Button>
        {!last && (
          <Button type="button" onClick={() => setStep((s) => s + 1)}>
            Siguiente
          </Button>
        )}
      </div>
    </div>
  );
}
