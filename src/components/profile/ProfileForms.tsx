"use client";

import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { Button, Field, FormError, TextAreaField } from "@/components/ui";
import { submitKeepingState } from "@/lib/form-submit";
import { choosePartAction, refreshPartAction, saveAndGenerateAction, type ProfileActionState } from "@/lib/profile/actions";
import type { Current } from "@/lib/profile/schemas";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

/* ───────────── Perfil de hoy ───────────── */

export function CurrentForm({ current, hasResult }: { current: Current | null; hasResult: boolean }) {
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(saveAndGenerateAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-4">
      <FormError message={state?.error} />
      <p className="text-sm text-ink-700">Copia lo que dice tu perfil de Instagram hoy (puedes dejar vacío lo que no tengas). Así sabemos qué mantener y qué mejorar.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tu usuario" name="usuario" defaultValue={current?.usuario ?? ""} maxLength={40} placeholder="@tuusuario" />
        <Field label="Nombre que aparece en tu perfil" name="nombre" defaultValue={current?.nombre ?? ""} maxLength={64} />
      </div>
      <TextAreaField label="Biografía actual" name="biografia" defaultValue={current?.biografia ?? ""} rows={4} maxLength={220} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Enlace (si tienes)" name="enlace" defaultValue={current?.enlace ?? ""} maxLength={200} />
        <Field label="Categoría (si tienes)" name="categoria" defaultValue={current?.categoria ?? ""} maxLength={60} placeholder="Ej. Blogger" />
      </div>
      <TextAreaField label="Nombres de tus destacadas (separados por coma)" name="destacadas" defaultValue={current?.destacadas.join(", ") ?? ""} rows={2} maxLength={300} />
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending && <LoadingOverlay title="Preparando tus propuestas…" />}{pending ? "Preparando tus propuestas…" : hasResult ? "Volver a generar mis propuestas" : "Proponme mejoras"}
      </Button>
      {hasResult && <p className="text-xs text-ink-500">Al volver a generar se reemplazan las propuestas anteriores (lo que ya elegiste se conserva).</p>}
    </form>
  );
}

/* ───────────── Nombre y biografía: elegir, editar, pedir otras ───────────── */

export function OptionPicker({ part, rounds, chosen, canRefresh, max }: { part: "nombre" | "biografia"; rounds: { options: string[]; note: string | null }[]; chosen: string; canRefresh: boolean; max: number }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(choosePartAction, undefined);
  const [rState, rAction, rPending] = useActionState<ProfileActionState, FormData>(refreshPartAction, undefined);
  const [own, setOwn] = useState(chosen);
  const [copied, setCopied] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const len = [...own].length;

  async function copy(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(t);
      setTimeout(() => setCopied(""), 1800);
    } catch {}
  }
  void router;

  return (
    <div className="flex flex-col gap-3">
      <FormError message={state?.error ?? rState?.error} />
      {state?.warning && <p className="rounded-lg bg-naranja-100 p-2 text-xs text-ink-900">{state.warning}</p>}
      {rounds.map((r, ri) => (
        <div key={ri} className="flex flex-col gap-2">
          {r.note && <p className="text-xs text-ink-500">Otras opciones según tu nota: “{r.note}”</p>}
          {r.options.map((o, i) => (
            <div key={`${ri}-${i}`} className={`flex flex-col gap-2 rounded-xl border p-3 ${o === chosen ? "border-azul bg-azul-50" : "border-ink-200 bg-blanco"}`}>
              <p className="text-sm whitespace-pre-line">{o}</p>
              <div className="flex flex-wrap items-center gap-2">
                <form onSubmit={submitKeepingState(action)} className="inline">
                  <input type="hidden" name="parte" value={part} />
                  <input type="hidden" name="texto" value={o} />
                  <Button type="submit" size="sm" variant={o === chosen ? "primary" : "outline"} disabled={pending}>
                    {o === chosen ? "Elegida ✓" : "Elegir esta"}
                  </Button>
                </form>
                <Button type="button" size="sm" variant="ghost" onClick={() => copy(o)}>
                  <Copy className="size-4" aria-hidden /> {copied === o ? "Copiado" : "Copiar"}
                </Button>
                {part === "biografia" && <span className="text-xs text-ink-500">{[...o].length}/{max}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}

      <form ref={form} onSubmit={submitKeepingState(action)} className="flex flex-col gap-2 rounded-xl bg-ink-100 p-3">
        <input type="hidden" name="parte" value={part} />
        <input type="hidden" name="editado" value="1" />
        <TextAreaField id={`own-${part}`} label={part === "nombre" ? "O escribe el tuyo" : "O escribe o ajusta la tuya"} name="texto" value={own} onChange={(e) => setOwn(e.target.value)} rows={part === "nombre" ? 1 : 3} />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" variant="outline" disabled={pending || own.trim().length < 2 || len > max}>
            Guardar la mía
          </Button>
          <span className={`text-xs ${len > max ? "text-alerta" : "text-ink-500"}`}>
            {len}/{max}
          </span>
        </div>
      </form>

      {canRefresh && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-azul">Ninguna me convence</summary>
          <form onSubmit={submitKeepingState(rAction)} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="parte" value={part} />
            <TextAreaField id={`nota-${part}`} label="¿Qué cambiarías?" name="nota" rows={2} maxLength={300} required />
            <Button type="submit" size="sm" variant="outline" disabled={rPending} className="self-start">
              {rPending ? "Buscando otras…" : "Dame otras 5"}
            </Button>
          </form>
        </details>
      )}
    </div>
  );
}

/* ───────────── Foto de perfil ───────────── */

export function PhotoUploader({ count, max }: { count: number; max: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/perfil/foto", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo calificar la foto.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calificar la foto.");
    }
    if (input.current) input.current.value = "";
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="tap inline-flex cursor-pointer items-center self-start rounded-full bg-azul px-5 text-sm font-semibold text-blanco">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
        {busy ? "Calificando… (unos segundos)" : count === 0 ? "Subir mi foto de perfil" : "Probar otra foto"}
      </label>
      {error && (
        <p role="alert" className="text-sm text-alerta">
          {error}
        </p>
      )}
      <p className="text-xs text-ink-500">JPG, PNG o WebP de hasta 8 MB. Guardamos hasta {max * 2} intentos para que veas cómo mejoras. No editamos ni generamos fotos con IA.</p>
    </div>
  );
}
