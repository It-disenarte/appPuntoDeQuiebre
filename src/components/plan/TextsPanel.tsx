"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, Chip, cn, FormError } from "@/components/ui";
import { generateTextsAction, reviewTextsAction, type PlanActionState } from "@/lib/plan/actions";
import { submitKeepingState } from "@/lib/form-submit";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

type Net = "instagram" | "tiktok" | "facebook";
type Block = { texto: string; hashtags: string[]; extra?: string };
export type TextsView = { ganchos: string[]; elegido: number; modo: "aprendizaje" | "rapido"; redes: Partial<Record<Net, Block>>; votos: Partial<Record<Net, "si" | "editado" | "no">>; edits: Partial<Record<Net, string>>; datos: string[] };

const NAMES: Record<Net, string> = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };

export function GenerateTexts({ id, again }: { id: string; again?: boolean }) {
  const [state, action, pending] = useActionState<PlanActionState, FormData>(generateTextsAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2">
      <FormError message={state?.error} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant={again ? "outline" : "primary"} size={again ? "sm" : "md"} disabled={pending} className="self-start">
        {pending && <LoadingOverlay title="Escribiendo tus textos…" />}{pending ? "Escribiendo tus textos…" : again ? "Volver a escribir los textos" : "Escribir los textos de publicación"}
      </Button>
    </form>
  );
}

function CopyButton({ text, onCopied }: { text: string; onCopied: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          onCopied();
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* el navegador no permitió copiar */
        }
      }}
      className="tap inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-blanco px-3 text-sm font-semibold hover:bg-ink-200/60"
    >
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {done ? "Copiado" : "Copiar"}
    </button>
  );
}

function Review({ id, net, vote }: { id: string; net: Net; vote?: "si" | "editado" | "no" }) {
  const [state, action, pending] = useActionState<PlanActionState, FormData>(reviewTextsAction, undefined);
  const send = submitKeepingState(action);
  const btn = (voto: "si" | "no", label: string) => (
    <form onSubmit={send} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="network" value={net} />
      <input type="hidden" name="voto" value={voto} />
      <button type="submit" disabled={pending} className={cn("tap rounded-full border px-3 text-sm font-semibold", vote === voto ? "border-azul bg-azul text-blanco" : "border-ink-300 bg-blanco hover:bg-ink-200/60")}>
        {label}
      </button>
    </form>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FormError message={state?.error} />
      {btn("si", "👍")}
      {btn("no", "👎")}
      {vote === "editado" && <Chip tone="azul">✏️ Editado</Chip>}
    </div>
  );
}

function NetworkCard({ id, net, block, view }: { id: string; net: Net; block: Block; view: TextsView }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<PlanActionState, FormData>(reviewTextsAction, undefined);
  const edited = view.edits[net];
  const shown = edited ?? block.texto;
  const full = [shown, block.hashtags.join(" ")].filter(Boolean).join("\n\n");
  const copied = () => {
    // Copiar sin editar cuenta como 👍 (regla 10 de la skill).
    if (!view.votos[net]) {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("network", net);
      fd.set("voto", edited ? "editado" : "si");
      action(fd);
    }
  };
  return (
    <section className="flex flex-col gap-3 rounded-card bg-blanco p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-extrabold">{NAMES[net]}</h3>
        <CopyButton text={full} onCopied={copied} />
      </div>
      <FormError message={state?.error} />
      {editing ? (
        <form
          onSubmit={(e) => {
            submitKeepingState(action)(e);
            setEditing(false);
          }}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="network" value={net} />
          <input type="hidden" name="voto" value="editado" />
          <textarea name="edited" defaultValue={shown} maxLength={4000} className="min-h-40 rounded-xl border border-ink-300 bg-blanco px-3 py-2 text-sm outline-none focus:border-azul focus:ring-4 focus:ring-azul/15" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Guardar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-ink-900">{shown}</p>
      )}
      {block.hashtags.length > 0 && <p className="text-sm font-semibold text-azul">{block.hashtags.join(" ")}</p>}
      {block.extra && <p className="text-xs text-ink-500">{block.extra}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="tap rounded-full border border-ink-300 bg-blanco px-3 text-sm font-semibold hover:bg-ink-200/60">
            ✏️ Editar
          </button>
        )}
        {view.modo === "aprendizaje" && <Review id={id} net={net} vote={view.votos[net]} />}
      </div>
    </section>
  );
}

export function TextsPanel({ id, view }: { id: string; view: TextsView }) {
  const [state, action, pending] = useActionState<PlanActionState, FormData>(reviewTextsAction, undefined);
  const [showAll, setShowAll] = useState(view.modo === "aprendizaje");
  const send = submitKeepingState(action);
  const nets = (Object.keys(view.redes) as Net[]).filter((n) => view.redes[n]);

  return (
    <div className="flex flex-col gap-4">
      <FormError message={state?.error} />
      <div className="flex flex-col gap-2 rounded-card bg-blanco p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-extrabold">{view.modo === "aprendizaje" ? "Elige tu gancho" : "Tu gancho"}</h3>
          {view.modo === "rapido" && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-sm font-semibold text-azul underline underline-offset-4">
              {showAll ? "Ocultar otros ganchos" : "Ver otros ganchos"}
            </button>
          )}
        </div>
        <ul className="flex flex-col gap-2">
          {view.ganchos.map((g, i) =>
            showAll || i === view.elegido ? (
              <li key={i}>
                <form onSubmit={send}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="gancho" value={i} />
                  <button type="submit" disabled={pending} className={cn("tap w-full rounded-xl border px-3 py-2 text-left text-sm", i === view.elegido ? "border-azul bg-azul-50 font-semibold" : "border-ink-300 bg-blanco hover:bg-ink-100")}>
                    {g}
                  </button>
                </form>
              </li>
            ) : null,
          )}
        </ul>
        {view.modo === "aprendizaje" && <p className="text-xs text-ink-500">Elige el que más te guste: los textos de cada red se ajustan a ese gancho. Al repetir con otro cuenta como una preferencia.</p>}
      </div>
      {nets.map((n) => (
        <NetworkCard key={n} id={id} net={n} block={view.redes[n]!} view={view} />
      ))}
      {view.datos.length > 0 && (
        <div className="rounded-card bg-naranja-100 p-4 text-sm text-ink-900">
          <p className="font-extrabold">Verifica antes de publicar</p>
          <ul className="mt-1 list-disc pl-5">{view.datos.map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
