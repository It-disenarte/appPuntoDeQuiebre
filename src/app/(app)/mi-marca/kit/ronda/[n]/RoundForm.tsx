"use client";

import { useActionState, useState } from "react";
import { Button, cn, FormError } from "@/components/ui";
import { ElementGlyph, ReelCover, Swatches, type Look } from "@/components/kit/KitPreview";
import { chooseElementsAction, chooseManualAction, chooseOptionsAction, refreshAction, startRoundAction, type KitActionState } from "@/lib/kit/actions";
import { submitKeepingState } from "@/lib/form-submit";
import { fontStack } from "@/lib/kit/fonts";
import { ELEMENTS, MAX_ELEMENTS, type FontOption, type PaletteOption, type TitleOption } from "@/lib/kit/schemas";
import { titleLookOf } from "@/lib/kit/look";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

type Opt = PaletteOption | FontOption | TitleOption;
type ManualData = { presets: { id: string; nombre: string }[]; styles: { id: string; nombre: string }[]; titleFonts: string[]; textFonts: string[] };

const card = "flex cursor-pointer flex-col gap-2 rounded-xl border border-ink-300 bg-blanco p-3 has-[:checked]:border-azul has-[:checked]:ring-4 has-[:checked]:ring-azul/15";

function Preview({ n, option, look, hook }: { n: number; option: Opt; look: Look; hook: string }) {
  if (n <= 2) {
    const o = option as PaletteOption;
    const l: Look = { ...look, colores: o.colores };
    return (
      <>
        <ReelCover look={l} text={hook} />
        <Swatches colores={o.colores} />
      </>
    );
  }
  if (n === 3) {
    const o = option as FontOption;
    const c = look.colores;
    return (
      <div style={{ background: c.fondo, borderRadius: 12, padding: 14, minHeight: 150 }}>
        <p style={{ fontFamily: fontStack(o.titulos), fontSize: 24, lineHeight: 1.1, color: c.texto, fontWeight: 700 }}>{hook}</p>
        <p style={{ fontFamily: fontStack(o.texto), fontSize: 13, color: c.texto, marginTop: 10, fontWeight: 700 }}>Así se lee tu texto: claro, con acentos y ñ.</p>
        <p className="mt-3 text-[11px] text-ink-500">
          {o.titulos} + {o.texto}
        </p>
      </div>
    );
  }
  const o = option as TitleOption;
  return <ReelCover look={{ ...look, title: titleLookOf(o) }} text={hook} />;
}

function Cards({ n, tandas, look, hook, multiple }: { n: number; tandas: Opt[][]; look: Look; hook: string; multiple: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (v: string) => setPicked((cur) => (multiple ? (cur.includes(v) ? cur.filter((x) => x !== v) : cur.length < 2 ? [...cur, v] : cur) : [v]));
  const last = tandas.length - 1;
  const renderTanda = (t: number) => (
    <div className="grid grid-cols-2 gap-3">
      {tandas[t]!.map((o) => {
        const value = `${t}:${o.id}`;
        return (
          <label key={value} className={card}>
            <input type={multiple ? "checkbox" : "radio"} name="opcion" value={value} checked={picked.includes(value)} onChange={() => toggle(value)} className="sr-only" />
            <Preview n={n} option={o} look={look} hook={hook} />
            <span className="text-sm font-semibold">{(o as { nombre?: string }).nombre || `Opción ${o.id}`}</span>
            {(o as { porque?: string }).porque && <span className="text-xs text-ink-500">{(o as { porque?: string }).porque}</span>}
          </label>
        );
      })}
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      {renderTanda(last)}
      {last > 0 && (
        <details className="rounded-xl bg-ink-100 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Ver opciones anteriores ({last})</summary>
          <div className="mt-3 flex flex-col gap-5">
            {Array.from({ length: last }, (_, i) => (
              <div key={i}>
                <p className="mb-2 text-xs font-semibold text-ink-500">Tanda {i + 1}</p>
                {renderTanda(i)}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function StartRound({ n }: { n: number }) {
  const [state, action, pending] = useActionState<KitActionState, FormData>(startRoundAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-3">
      <FormError message={state?.error} />
      <input type="hidden" name="ronda" value={n} />
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending && <LoadingOverlay title="Preparando tus opciones…" />}{pending ? "Preparando tus opciones…" : "Empezar esta ronda"}
      </Button>
    </form>
  );
}

export function RoundForm({ n, tandas, look, hook, refreshes, maxRefresh, manual }: { n: 1 | 2 | 3 | 4; tandas: Opt[][]; look: Look; hook: string; refreshes: number; maxRefresh: number; manual: ManualData }) {
  const [state, action, pending] = useActionState<KitActionState, FormData>(chooseOptionsAction, undefined);
  const [rState, rAction, rPending] = useActionState<KitActionState, FormData>(refreshAction, undefined);
  const [mState, mAction, mPending] = useActionState<KitActionState, FormData>(chooseManualAction, undefined);
  const multiple = n === 4;
  const left = maxRefresh - refreshes;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-4">
        <FormError message={state?.error} />
        <input type="hidden" name="ronda" value={n} />
        <Cards n={n} tandas={tandas} look={look} hook={hook} multiple={multiple} />
        <p className="text-xs text-ink-500">{multiple ? "Puedes elegir 1 o 2 estilos." : "Elige una opción."}</p>
        <Button type="submit" size="lg" disabled={pending} className="self-start">
          {pending ? "Guardando…" : "Continuar"}
        </Button>
      </form>

      {left > 0 ? (
        <form onSubmit={submitKeepingState(rAction)} className="flex flex-col gap-2 rounded-xl bg-ink-100 p-4">
          <FormError message={rState?.error} />
          <input type="hidden" name="ronda" value={n} />
          <label htmlFor="nota" className="text-sm font-semibold text-ink-800">
            ¿Ninguna te convence? Cuéntanos qué no te gustó (opcional)
          </label>
          <input id="nota" name="nota" maxLength={300} className="h-12 rounded-xl border border-ink-300 bg-blanco px-4 text-base outline-none focus:border-azul focus:ring-4 focus:ring-azul/15" />
          <Button type="submit" variant="outline" size="sm" disabled={rPending} className="self-start">
            {rPending ? "Buscando nuevas opciones…" : `Ninguna me convence (te quedan ${left})`}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitKeepingState(mAction)} className="flex flex-col gap-3 rounded-xl bg-ink-100 p-4">
          <p className="text-sm font-semibold">Ya usaste los 2 cambios. Elige tú de esta lista corta:</p>
          <FormError message={mState?.error} />
          <input type="hidden" name="ronda" value={n} />
          {n <= 2 && (
            <select name="preset" defaultValue="" className="h-12 rounded-xl border border-ink-300 bg-blanco px-4 text-base" aria-label="Paleta">
              <option value="" disabled>
                Elige una paleta
              </option>
              {manual.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          )}
          {n === 3 && (
            <div className="grid grid-cols-2 gap-3">
              <select name="titulos" defaultValue="" className="h-12 rounded-xl border border-ink-300 bg-blanco px-3 text-base" aria-label="Letra de títulos">
                <option value="" disabled>
                  Letra de títulos
                </option>
                {manual.titleFonts.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select name="texto" defaultValue="" className="h-12 rounded-xl border border-ink-300 bg-blanco px-3 text-base" aria-label="Letra de texto">
                <option value="" disabled>
                  Letra de texto
                </option>
                {manual.textFonts.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          )}
          {n === 4 && (
            <select name="style" defaultValue="" className="h-12 rounded-xl border border-ink-300 bg-blanco px-4 text-base" aria-label="Estilo de títulos">
              <option value="" disabled>
                Elige un estilo
              </option>
              {manual.styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
          <Button type="submit" size="sm" disabled={mPending} className="self-start">
            {mPending ? "Guardando…" : "Usar esta"}
          </Button>
        </form>
      )}
    </div>
  );
}

/** Ronda 5: elementos simples de una biblioteca fija, pintados con tu acento (sin IA). */
export function ElementsForm({ look, initial }: { look: Look; initial: string[] }) {
  const [state, action, pending] = useActionState<KitActionState, FormData>(chooseElementsAction, undefined);
  const [picked, setPicked] = useState<string[]>(initial);
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < MAX_ELEMENTS ? [...cur, id] : cur));
  const accent = look.colores.acento;
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-4">
      <FormError message={state?.error} />
      <div className="grid grid-cols-4 gap-3">
        {ELEMENTS.map((e) => {
          const on = picked.includes(e.id);
          return (
            <label key={e.id} className={cn(card, "items-center", !on && picked.length >= MAX_ELEMENTS && "opacity-50")}>
              <input type="checkbox" name="elemento" value={e.id} checked={on} onChange={() => toggle(e.id)} className="sr-only" />
              <span className="grid size-14 place-items-center rounded-lg" style={{ background: look.colores.fondo }}>
                <ElementGlyph id={e.id} color={accent} size={36} />
              </span>
              <span className="text-center text-xs font-semibold">{e.label}</span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-ink-500">
        {picked.length} de {MAX_ELEMENTS} elegidos. Son opcionales.
      </p>
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Guardando…" : picked.length ? "Continuar" : "Continuar sin elementos"}
      </Button>
    </form>
  );
}

