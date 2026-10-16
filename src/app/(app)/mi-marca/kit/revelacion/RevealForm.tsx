"use client";

import { useActionState, useState } from "react";
import { Button, cn, FormError } from "@/components/ui";
import { CarouselCover, ReelCover, type CarouselStyle, type Look } from "@/components/kit/KitPreview";
import { startRevealAction, submitVotesAction, type KitActionState } from "@/lib/kit/actions";
import { submitKeepingState } from "@/lib/form-submit";
import { PIECES, VOTE_REASONS, type PieceId } from "@/lib/kit/schemas";

type PieceState = { voto: "si" | "no" | "pendiente"; ajustes: number; noUsar: boolean };
type Props = {
  looks: { ganchos: Look; reflexiones: Look };
  carousel: { foto: CarouselStyle; solida: CarouselStyle };
  photos: string[];
  hook: string;
  pieces: Record<PieceId, PieceState>;
  maxAdjust: number;
};

export function RevealForm({ looks, carousel, photos, hook, pieces, maxAdjust }: Props) {
  const [state, action, pending] = useActionState<KitActionState, FormData>(submitVotesAction, undefined);
  const [votes, setVotes] = useState<Partial<Record<PieceId, "si" | "no">>>({});

  const render = (id: PieceId) => {
    const photo = (i: number) => photos[i % photos.length] ?? null;
    switch (id) {
      case "carrusel_foto_con_bloque":
        return <CarouselCover look={looks.ganchos} text={hook} photo={photo(0)} style={carousel.foto} label="Portada de carrusel con foto" />;
      case "carrusel_solida":
        return <CarouselCover look={looks.ganchos} text={hook} style={carousel.solida} label="Portada de carrusel de color" />;
      case "reel_gancho":
        return <ReelCover look={looks.ganchos} text={hook} photo={photo(1)} label="Portada de reel (gancho)" />;
      default:
        return <ReelCover look={looks.reflexiones} text={hook} photo={photo(2)} label="Portada de reel (reflexión)" />;
    }
  };

  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-6">
      <FormError message={state?.error} />
      <div className="grid grid-cols-2 gap-4">
        {PIECES.map((p) => {
          const st = pieces[p.id];
          const settled = st.voto === "si" || st.noUsar;
          const vote = votes[p.id];
          return (
            <fieldset key={p.id} className={cn("flex flex-col gap-2 rounded-card bg-blanco p-3 shadow-card", settled && "opacity-80")}>
              <legend className="sr-only">{p.label}</legend>
              {render(p.id)}
              <p className="text-sm font-semibold">{p.label}</p>
              {st.noUsar ? (
                <p className="text-xs text-ink-500">Este tipo de pieza no logró gustar y no se usará.</p>
              ) : st.voto === "si" ? (
                <p className="text-xs font-semibold text-exito">👍 Te gusta</p>
              ) : (
                <>
                  <div className="flex gap-2">
                    {(["si", "no"] as const).map((v) => (
                      <label key={v} className={cn("tap inline-flex flex-1 cursor-pointer items-center justify-center rounded-full border text-sm font-semibold select-none", vote === v ? "border-azul bg-azul text-blanco" : "border-ink-300 bg-blanco")}>
                        <input type="radio" name={`voto_${p.id}`} value={v} checked={vote === v} onChange={() => setVotes((c) => ({ ...c, [p.id]: v }))} className="sr-only" />
                        {v === "si" ? "👍" : "👎"}
                      </label>
                    ))}
                  </div>
                  {vote === "no" && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {VOTE_REASONS.map((r) => (
                          <label key={r.id} className="tap inline-flex cursor-pointer items-center rounded-full border border-ink-300 px-3 text-xs font-semibold has-[:checked]:border-azul has-[:checked]:bg-azul has-[:checked]:text-blanco">
                            <input type="checkbox" name={`motivos_${p.id}`} value={r.id} className="sr-only" />
                            {r.label}
                          </label>
                        ))}
                      </div>
                      <input name={`nota_${p.id}`} maxLength={300} placeholder="¿Qué cambiarías? (opcional)" className="h-11 rounded-xl border border-ink-300 px-3 text-sm outline-none focus:border-azul focus:ring-4 focus:ring-azul/15" />
                      <p className="text-[11px] text-ink-500">Ajustes usados: {st.ajustes} de {maxAdjust}</p>
                    </div>
                  )}
                </>
              )}
            </fieldset>
          );
        })}
      </div>
      <Button type="submit" size="lg" disabled={pending || Object.keys(votes).length === 0} className="self-start">
        {pending ? "Aplicando tus calificaciones…" : "Enviar calificaciones"}
      </Button>
    </form>
  );
}

export function StartReveal() {
  const [state, action, pending] = useActionState<KitActionState, FormData>(startRevealAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-3">
      <FormError message={state?.error} />
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Armando tu kit…" : "Armar mi kit"}
      </Button>
    </form>
  );
}
