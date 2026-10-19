"use client";

import { useActionState, useState } from "react";
import { Button, cn, Field, FormError, TextAreaField } from "@/components/ui";
import { chooseIdeaAction, createCarouselAction, refreshIdeasAction, saveAnswersAction, type CarouselActionState } from "@/lib/carousel/actions";
import { GOALS, IMAGE_STYLES, TYPES, type Idea, type InterviewOut } from "@/lib/carousel/schemas";
import { submitKeepingState } from "@/lib/form-submit";

function Chips({ name, items, value, onChange }: { name: string; items: readonly { id: string; label: string; hint?: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {items.map((t) => (
        <label key={t.id} className={cn("tap inline-flex cursor-pointer flex-col justify-center rounded-xl border px-4 py-2 text-left text-sm select-none", value === t.id ? "border-azul bg-azul-50" : "border-ink-300 bg-blanco hover:bg-ink-100")}>
          <input type="radio" name={name} value={t.id} checked={value === t.id} onChange={() => onChange(t.id)} className="sr-only" />
          <span className="font-semibold">{t.label}</span>
          {t.hint && <span className="text-xs text-ink-500">{t.hint}</span>}
        </label>
      ))}
    </div>
  );
}

/* ───────────── 1 · Brief ───────────── */

export function BriefForm({ tema = "", pieza, plan = "basico" }: { tema?: string; pieza?: string; plan?: "basico" | "pro" }) {
  const [state, action, pending] = useActionState<CarouselActionState, FormData>(createCarouselAction, undefined);
  const [tipo, setTipo] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [estilo, setEstilo] = useState("");
  const [animado, setAnimado] = useState(false);
  const [invite, setInvite] = useState(false);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-5">
      <FormError message={state?.error} />
      {pieza && <input type="hidden" name="pieza" value={pieza} />}
      <Field label="¿De qué trata tu carrusel?" name="tema" defaultValue={tema} maxLength={140} required placeholder="Ej. 5 errores al empezar un huerto" />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">¿Qué tipo de carrusel?</legend>
        <Chips name="tipo" items={TYPES} value={tipo} onChange={setTipo} />
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">¿Qué quieres que pase?</legend>
        <Chips name="objetivo" items={GOALS} value={objetivo} onChange={setObjetivo} />
      </fieldset>
      {objetivo === "leads" && <Field label="Palabra clave" name="palabra_clave" maxLength={30} hint="Ej. CREA: “Comenta CREA y te mando…”" />}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">¿Cómo lo quieres ver?</legend>
        <Chips name="estilo_imagenes" items={IMAGE_STYLES} value={estilo} onChange={setEstilo} />
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">¿Lo quieres con movimiento?</legend>
        <input type="hidden" name="animado" value={animado ? "1" : "0"} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => (setAnimado(false), setInvite(false))} aria-pressed={!animado} className={cn("tap inline-flex items-center rounded-xl border px-4 py-2 text-sm font-semibold", !animado ? "border-azul bg-azul-50" : "border-ink-300 bg-blanco")}>
            Estático (PNG)
          </button>
          <button
            type="button"
            onClick={() => (plan === "pro" ? setAnimado(true) : setInvite(true))}
            aria-pressed={animado}
            aria-disabled={plan !== "pro"}
            className={cn("tap inline-flex items-center rounded-xl border px-4 py-2 text-sm font-semibold", plan !== "pro" ? "border-ink-200 bg-ink-100 text-ink-400" : animado ? "border-azul bg-azul-50" : "border-ink-300 bg-blanco")}
          >
            Animado {plan !== "pro" && "· Pro"}
          </button>
        </div>
        {invite && plan !== "pro" && (
          <p role="status" className="rounded-lg bg-naranja-100 p-3 text-sm text-ink-900">
            Los carruseles animados son del <strong>plan Pro</strong>. Puedes subir de plan desde <a href="/mi-marca" className="font-semibold underline underline-offset-4">Mi marca</a>; mientras tanto armamos tu carrusel estático y lo dejamos listo para animarse.
          </p>
        )}
        {animado && plan === "pro" && <p className="text-xs text-ink-600">La animación en video se activa pronto. Hoy guardamos tu preferencia y descargas las imágenes estáticas.</p>}
      </fieldset>
      <Button type="submit" size="lg" disabled={pending || !tipo || !objetivo || !estilo} className="self-start">
        {pending ? "Pensando ideas…" : "Proponme ideas"}
      </Button>
      <p className="text-xs text-ink-500">Tarda unos segundos. Te daremos 3 ideas distintas y tú eliges.</p>
    </form>
  );
}

/* ───────────── 2 · Ideas ───────────── */

export function IdeasStep({ id, rounds, canRefresh, recommended }: { id: string; rounds: { items: Idea[]; note: string | null }[]; canRefresh: boolean; recommended: { tipo: string | null; porque: string | null } }) {
  const [state, action, pending] = useActionState<CarouselActionState, FormData>(chooseIdeaAction, undefined);
  const [rState, rAction, rPending] = useActionState<CarouselActionState, FormData>(refreshIdeasAction, undefined);
  const [own, setOwn] = useState("");
  return (
    <div className="flex flex-col gap-4">
      {recommended.tipo && (
        <p className="rounded-xl bg-azul-50 p-3 text-sm">
          Te recomendamos el tipo <strong>{TYPES.find((t) => t.id === recommended.tipo)?.label ?? recommended.tipo}</strong>. {recommended.porque}
        </p>
      )}
      <FormError message={state?.error ?? rState?.error} />
      {rounds.map((r, ri) => (
        <div key={ri} className="flex flex-col gap-2">
          {r.note && <p className="text-xs text-ink-500">Otras ideas según tu nota: “{r.note}”</p>}
          <div className="grid gap-3 md:grid-cols-3">
            {r.items.map((idea) => (
              <form key={idea.id} onSubmit={submitKeepingState(action)} className="flex flex-col gap-2 rounded-card bg-blanco p-4 shadow-card">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="idea" value={idea.id} />
                <span className="text-xs font-semibold uppercase tracking-wide text-azul">{idea.angulo}</span>
                <p className="font-extrabold">{idea.titulo}</p>
                <p className="text-sm text-ink-600">{idea.promesa}</p>
                <Button type="submit" size="sm" disabled={pending} className="mt-auto self-start">
                  {pending ? "Armando…" : "Elegir esta"}
                </Button>
              </form>
            ))}
          </div>
        </div>
      ))}
      {pending && <p className="text-sm text-ink-600">Armando tu carrusel. Puede tardar hasta un minuto…</p>}

      {canRefresh ? (
        <form onSubmit={submitKeepingState(rAction)} className="flex flex-col gap-2 rounded-xl bg-ink-100 p-4">
          <input type="hidden" name="id" value={id} />
          <TextAreaField label="Ninguna me convence porque…" name="nota" rows={2} maxLength={300} required />
          <Button type="submit" variant="outline" size="sm" disabled={rPending} className="self-start">
            {rPending ? "Buscando otras…" : "Dame otras ideas"}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2 rounded-xl bg-ink-100 p-4">
          <input type="hidden" name="id" value={id} />
          <Field label="Escribe tu propia idea" name="propia" value={own} onChange={(e) => setOwn(e.target.value)} maxLength={100} />
          <Button type="submit" variant="outline" size="sm" disabled={pending || own.trim().length < 3} className="self-start">
            Usar mi idea
          </Button>
        </form>
      )}
    </div>
  );
}

/* ───────────── 3 · Entrevista de imágenes con IA ───────────── */

export function InterviewStep({ id, interview, previous }: { id: string; interview: InterviewOut; previous?: { estilo: string; aparece_creador: string; herramienta: string } | null }) {
  const [state, action, pending] = useActionState<CarouselActionState, FormData>(saveAnswersAction, undefined);
  const q = (qid: string) => interview.preguntas.find((p) => p.id === qid);
  const estilo = q("estilo");
  const [est, setEst] = useState(() => (previous?.estilo && [...(interview.preguntas.find((p) => p.id === "estilo")?.opciones ?? []), "elige_por_mi"].includes(previous.estilo) ? previous.estilo : "elige_por_mi"));
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-5">
      <FormError message={state?.error} />
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-ink-700">Nosotros <strong>no generamos las imágenes</strong>: te damos los prompts para que las crees en tu propia cuenta de Gemini o ChatGPT y las subas aquí.</p>
      {previous && previous.estilo !== "elige_por_mi" && <p className="rounded-lg bg-azul-50 p-3 text-sm">La última vez elegiste <strong>{previous.estilo}</strong>. Ya lo dejamos marcado: cámbialo si quieres otra cosa. Tu línea visual es solo tuya y no se comparte con nadie más.</p>}
      {estilo && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">{estilo.texto}</legend>
          <div className="flex flex-wrap gap-2">
            {[...estilo.opciones, "elige_por_mi"].map((o) => (
              <label key={o} className={cn("tap inline-flex cursor-pointer items-center rounded-full border px-4 text-sm font-semibold select-none", est === o ? "border-azul bg-azul text-blanco" : "border-ink-300 bg-blanco hover:bg-ink-100")}>
                <input type="radio" name="estilo" value={o} checked={est === o} onChange={() => setEst(o)} className="sr-only" />
                {o === "elige_por_mi" ? "Elige por mí" : o}
                {estilo.recomendada === o && " ★"}
              </label>
            ))}
          </div>
          {estilo.recomendada && <p className="text-xs text-ink-500">★ Recomendado: {estilo.recomendada}. {estilo.porque}</p>}
        </fieldset>
      )}
      {q("ambiente") && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">{q("ambiente")!.texto}</legend>
          <div className="flex flex-wrap gap-2">
            {q("ambiente")!.opciones.map((o) => (
              <label key={o} className="tap inline-flex cursor-pointer items-center rounded-full border border-ink-300 bg-blanco px-4 text-sm font-semibold has-[:checked]:border-azul has-[:checked]:bg-azul has-[:checked]:text-blanco">
                <input type="checkbox" name="ambiente" value={o} className="sr-only" />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">¿Quieres salir tú en las imágenes?</legend>
        {[
          ["no", "No, solo objetos o escenas"],
          ["si_con_foto_referencia", "Sí, subo una foto mía como referencia"],
          ["mixta", "Mixta: mi foto en la portada y yo de espaldas en las demás"],
        ].map(([v, l]) => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name="aparece_creador" value={v} defaultChecked={v === (previous?.aparece_creador ?? "no")} /> {l}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">¿Usamos los colores de tu marca?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="colores" value="kit" defaultChecked /> Sí, los de mi kit
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="colores" value="otros" /> Otros
        </label>
        <Field label="Cuéntanos qué colores (solo si elegiste “otros”)" name="colores_otros" maxLength={120} />
      </fieldset>
      <TextAreaField label={q("narracion")?.texto ?? "Cuéntanos cómo te imaginas la portada"} name="narracion" rows={4} maxLength={1500} required placeholder={q("narracion")?.ejemplo} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">¿Dónde vas a crear las imágenes?</legend>
        {[
          ["gemini", "Gemini"],
          ["chatgpt", "ChatGPT"],
          ["no_se", "No sé, recomiéndame"],
        ].map(([v, l]) => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name="herramienta" value={v} defaultChecked={v === (previous?.herramienta ?? "no_se")} /> {l}
          </label>
        ))}
      </fieldset>
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Armando tu carrusel…" : "Armar mi carrusel"}
      </Button>
      {pending && <p className="text-sm text-ink-600">Puede tardar hasta un minuto…</p>}
    </form>
  );
}
