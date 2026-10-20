"use client";

import { useActionState } from "react";
import { Button, FormError, TextAreaField } from "@/components/ui";
import { requestAdjustAction, requestEditAction, requestRenderAction, setSubtitleAction, setTitleAction, type EditActionState } from "@/lib/edit/actions";
import { submitKeepingState } from "@/lib/form-submit";

function Simple({ action, pieceId, label, busy, variant = "light", modo }: { action: (p: EditActionState, fd: FormData) => Promise<EditActionState>; pieceId: string; label: string; busy: string; variant?: "light" | "outline" | "ghost"; modo?: string }) {
  const [state, act, pending] = useActionState<EditActionState, FormData>(action, undefined);
  return (
    <form onSubmit={submitKeepingState(act)} className="flex flex-col gap-2">
      <input type="hidden" name="pieza" value={pieceId} />
      {modo && <input type="hidden" name="modo" value={modo} />}
      <Button type="submit" variant={variant} disabled={pending} className={variant === "ghost" ? "self-start text-blanco hover:bg-ink-700" : "self-start"}>
        {pending ? busy : label}
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-alerta-100">
          {state.error}
        </p>
      )}
    </form>
  );
}

export const RequestEditButton = ({ pieceId, label = "Mandar a edición", modo }: { pieceId: string; label?: string; modo?: "a_camara" | "mixto" | "voz_en_off" }) => <Simple action={requestEditAction} pieceId={pieceId} label={label} busy="Enviando…" modo={modo} />;
export const RenderButton = ({ pieceId }: { pieceId: string }) => <Simple action={requestRenderAction} pieceId={pieceId} label="Se ve bien, armar mi video" busy="Enviando…" />;

export function AdjustForm({ pieceId, left }: { pieceId: string; left: number }) {
  const [state, action, pending] = useActionState<EditActionState, FormData>(requestAdjustAction, undefined);
  return (
    <details className="rounded-xl bg-ink-700 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Pedir un cambio ({left} {left === 1 ? "ajuste" : "ajustes"})</summary>
      <form onSubmit={submitKeepingState(action)} className="mt-2 flex flex-col gap-2">
        <FormError message={state?.error} />
        <input type="hidden" name="pieza" value={pieceId} />
        <TextAreaField label="¿Qué quieres que cambie?" name="nota" rows={2} maxLength={300} required />
        <p className="text-xs text-ink-300">Solo cambiamos lo que pidas; lo demás queda igual.</p>
        <Button type="submit" variant="light" size="sm" disabled={pending || left <= 0} className="self-start">
          {pending ? "Enviando…" : "Pedir el cambio"}
        </Button>
      </form>
    </details>
  );
}

/** Editar el texto de un subtítulo o de un título en pantalla (cambio sin IA). */
export function TextEditor({ pieceId, index, initial, kind }: { pieceId: string; index: number; initial: string; kind: "subtitulo" | "titulo" }) {
  const [state, action, pending] = useActionState<EditActionState, FormData>(kind === "subtitulo" ? setSubtitleAction : setTitleAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="pieza" value={pieceId} />
      <input type="hidden" name="i" value={index} />
      <input name="texto" defaultValue={initial} maxLength={kind === "subtitulo" ? 200 : 120} aria-label={kind === "subtitulo" ? "Texto del subtítulo" : "Texto en pantalla"} className="h-10 min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-blanco" />
      <Button type="submit" size="sm" variant="ghost" disabled={pending} className="text-blanco hover:bg-ink-600">
        {pending ? "…" : "Guardar"}
      </Button>
      {state?.error && <span className="w-full text-xs text-alerta-100">{state.error}</span>}
    </form>
  );
}
