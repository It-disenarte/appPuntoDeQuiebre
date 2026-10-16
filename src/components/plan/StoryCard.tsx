"use client";

import { useActionState, useState } from "react";
import { Button, cn, FormError } from "@/components/ui";
import { storyAction, type PlanActionState } from "@/lib/plan/actions";
import { submitKeepingState } from "@/lib/form-submit";

type Props = {
  id: string;
  dayLabel: string;
  tipo: string;
  idea: string;
  texto: string;
  sticker: string | null;
  minutos: number;
  own: boolean;
  vote: "no" | "mas_o_menos" | "si" | null;
  done: boolean;
  mode: "aprendizaje" | "rapido";
};

const VOTES = [
  { v: "no", e: "😞", label: "No me late" },
  { v: "mas_o_menos", e: "😐", label: "Más o menos" },
  { v: "si", e: "🙂", label: "Me gusta" },
] as const;

/** Idea de historia del día: otra idea, voto en tres niveles, texto editable, "ya la hice" y, un día a la semana, idea propia. */
export function StoryCard(p: Props) {
  const [state, action, pending] = useActionState<PlanActionState, FormData>(storyAction, undefined);
  const [editing, setEditing] = useState(false);
  const send = submitKeepingState(action);

  const op = (name: string, extra: Record<string, string> = {}, children: React.ReactNode, className?: string) => (
    <form onSubmit={send} className="inline">
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="op" value={name} />
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" disabled={pending} className={className}>
        {children}
      </button>
    </form>
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-ink-100 p-4">
      <FormError message={state?.error} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <span className="font-semibold text-ink-700">{p.dayLabel}</span>·<span>{p.tipo}</span>·<span>{p.minutos} min</span>
        {p.sticker && (
          <>
            ·<span>Sticker: {p.sticker}</span>
          </>
        )}
      </div>

      {p.own ? (
        <form onSubmit={send} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="op" value="propia" />
          <p className="text-sm font-semibold">Hoy la idea es tuya. ¿Qué vas a mostrar, qué vas a decir o preguntar y usarías un sticker?</p>
          <textarea name="texto" defaultValue={p.idea.startsWith("Hoy la idea es tuya") ? "" : p.idea} required minLength={20} className="min-h-24 rounded-xl border border-ink-300 bg-blanco px-3 py-2 text-sm outline-none focus:border-azul focus:ring-4 focus:ring-azul/15" />
          <Button type="submit" size="sm" disabled={pending} className="self-start">
            Guardar mi idea
          </Button>
          <p className="text-xs text-ink-500">Mínimo 15 palabras. Cualquier historia que publiques ese día cumple tu racha.</p>
        </form>
      ) : (
        <>
          <p className="text-sm font-semibold text-ink-900">{p.idea}</p>
          {editing ? (
            <form onSubmit={(e) => { send(e); setEditing(false); }} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="op" value="editar" />
              <textarea name="texto" defaultValue={p.texto} maxLength={600} className="min-h-20 rounded-xl border border-ink-300 bg-blanco px-3 py-2 text-sm outline-none focus:border-azul focus:ring-4 focus:ring-azul/15" />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending}>
                  Guardar texto
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            p.texto && <p className="rounded-lg bg-blanco p-3 text-sm text-ink-800">“{p.texto}”</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {op("otra", {}, "Otra idea", "tap rounded-full border border-ink-300 bg-blanco px-4 text-sm font-semibold hover:bg-ink-200/60")}
            {!editing && <button type="button" onClick={() => setEditing(true)} className="tap rounded-full border border-ink-300 bg-blanco px-4 text-sm font-semibold hover:bg-ink-200/60">✏️ Editar texto</button>}
          </div>
          {p.mode === "aprendizaje" && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="¿Te gustó la idea?">
              {VOTES.map((x) => (
                <span key={x.v}>
                  {op("voto", { voto: x.v }, <>{x.e} {x.label}</>, cn("tap rounded-full border px-3 text-xs font-semibold", p.vote === x.v ? "border-azul bg-azul text-blanco" : "border-ink-300 bg-blanco hover:bg-ink-200/60"))}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      <div>{op("hecha", { hecha: p.done ? "0" : "1" }, p.done ? "✓ Ya la subí (deshacer)" : "Ya la subí", cn("tap rounded-full px-4 text-sm font-semibold", p.done ? "bg-exito-100 text-exito" : "bg-azul text-blanco"))}</div>
    </div>
  );
}
