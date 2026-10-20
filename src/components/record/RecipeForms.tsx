"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { Button, FormError, TextAreaField } from "@/components/ui";
import { submitKeepingState } from "@/lib/form-submit";
import { requestRecipeAction, requestRecipeAdjustAction, type RecipeActionState } from "@/lib/edit/recipe-actions";
import { megabytes } from "@/lib/recording/rules";

export function RecipeButton({ pieceId, label = "Armar mi receta" }: { pieceId: string; label?: string }) {
  const [state, action, pending] = useActionState<RecipeActionState, FormData>(requestRecipeAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2">
      <input type="hidden" name="pieza" value={pieceId} />
      <Button type="submit" variant="light" disabled={pending} className="self-start">
        {pending ? "Enviando…" : label}
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-alerta-100">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function RecipeAdjustForm({ pieceId, left }: { pieceId: string; left: number }) {
  const [state, action, pending] = useActionState<RecipeActionState, FormData>(requestRecipeAdjustAction, undefined);
  return (
    <details className="rounded-xl bg-ink-700 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Pedir un cambio ({left} {left === 1 ? "ajuste" : "ajustes"})</summary>
      <form onSubmit={submitKeepingState(action)} className="mt-2 flex flex-col gap-2">
        <FormError message={state?.error} />
        <input type="hidden" name="pieza" value={pieceId} />
        <TextAreaField label="¿Qué quieres que cambie?" name="nota" rows={2} maxLength={300} required />
        <Button type="submit" variant="light" size="sm" disabled={pending || left <= 0} className="self-start">
          {pending ? "Enviando…" : "Pedir el cambio"}
        </Button>
      </form>
    </details>
  );
}

const TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const mimeOf = (f: File) => (TYPES.includes(f.type) ? f.type : /\.mov$/i.test(f.name) ? "video/quicktime" : /\.webm$/i.test(f.name) ? "video/webm" : /\.(mp4|m4v)$/i.test(f.name) ? "video/mp4" : "");

function duration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => (URL.revokeObjectURL(url), resolve(Number.isFinite(v.duration) ? Math.max(1, Math.round(v.duration)) : 5));
    v.onerror = () => (URL.revokeObjectURL(url), resolve(5));
    v.src = url;
  });
}

/** Sube varias tomas sueltas, una por una, con su avance. */
export function ClipUploader({ pieceId, count, max }: { pieceId: string; count: number; max: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const list = Array.from(files).slice(0, max - count);
    for (const [i, file] of list.entries()) {
      const mime = mimeOf(file);
      if (!mime) {
        setError(`«${file.name}» no es un video compatible (MP4, MOV o WebM).`);
        break;
      }
      setStatus(`Subiendo toma ${i + 1} de ${list.length} · ${megabytes(file.size)} MB…`);
      const secs = await duration(file);
      const err = await new Promise<string | null>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/grabaciones/clips?pieza=${encodeURIComponent(pieceId)}&segundos=${secs}`);
        xhr.setRequestHeader("Content-Type", mime);
        xhr.upload.onprogress = (e) => e.lengthComputable && setStatus(`Subiendo toma ${i + 1} de ${list.length} · ${Math.round((e.loaded / e.total) * 100)} %`);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve(null);
          try {
            resolve((JSON.parse(xhr.responseText) as { error?: string }).error ?? "No se pudo subir.");
          } catch {
            resolve("No se pudo subir.");
          }
        };
        xhr.onerror = () => resolve("Sin conexión. Intenta de nuevo con WiFi.");
        xhr.send(file);
      });
      if (err) {
        setError(err);
        break;
      }
    }
    if (input.current) input.current.value = "";
    setBusy(false);
    setStatus("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="tap inline-flex cursor-pointer items-center self-start rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
        <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" multiple className="sr-only" onChange={(e) => upload(e.target.files)} disabled={busy || count >= max} />
        {busy ? "Subiendo…" : count === 0 ? "Subir mis tomas" : "Subir más tomas"}
      </label>
      {status && (
        <p className="text-xs text-ink-300" aria-live="polite">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-alerta-100">
          {error}
        </p>
      )}
      <p className="text-xs text-ink-300">
        {count} de {max} tomas · MP4, MOV o WebM. Se conservan 30 días.
      </p>
    </div>
  );
}
