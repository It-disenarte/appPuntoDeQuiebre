"use client";

import { ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { Button, FormError } from "@/components/ui";
import { removeShotAction, submitReportAction, type MetricsActionState } from "@/lib/metrics/actions";
import { submitKeepingState } from "@/lib/form-submit";
import { errorText } from "@/lib/net-error";

const MAX = 8;

export function ShotUploader({ period, count }: { period: string; count: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, action, pending] = useActionState<MetricsActionState, FormData>(submitReportAction, undefined);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    for (const file of Array.from(files).slice(0, MAX - count)) {
      try {
        const res = await fetch(`/api/metricas/captura?periodo=${period}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "No se pudo subir la captura.");
      } catch (err) {
        setError(errorText(err, "No se pudo subir la captura."));
        break;
      }
    }
    if (input.current) input.current.value = "";
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="relative overflow-hidden rounded-xl bg-ink-100" style={{ aspectRatio: "9 / 16" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/metricas/captura/${i}?periodo=${period}&t=${count}`} alt={`Captura ${i + 1}`} className="size-full object-cover" />
            <form action={removeShotAction} className="absolute right-1 top-1">
              <input type="hidden" name="periodo" value={period} />
              <input type="hidden" name="i" value={i} />
              <button type="submit" aria-label={`Quitar la captura ${i + 1}`} className="tap grid size-9 place-items-center rounded-full bg-negro/70 text-sm font-bold text-blanco">
                ✕
              </button>
            </form>
          </div>
        ))}
        {count < MAX && (
          <label className="tap grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-ink-300 text-center text-sm font-semibold text-ink-600 hover:bg-ink-100" style={{ aspectRatio: "9 / 16" }}>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => upload(e.target.files)} disabled={busy} />
            <span className="flex flex-col items-center gap-1 px-2">
              <ImagePlus className="size-6" aria-hidden />
              {busy ? "Subiendo…" : "Subir capturas"}
            </span>
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-alerta-100 px-4 py-3 text-sm font-semibold text-alerta">
          {error}
        </p>
      )}
      <p className="text-xs text-ink-500">
        {count} de {MAX} capturas (mínimo 1). JPG, PNG o WebP de hasta 8 MB. <strong>Las borramos en cuanto las leemos</strong>: solo guardamos los números.
      </p>
      <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2">
        <FormError message={state?.error} />
        <input type="hidden" name="periodo" value={period} />
        <Button type="submit" size="lg" disabled={pending || count < 1} className="self-start">
          {pending ? "Enviando…" : "Leer mis capturas"}
        </Button>
      </form>
    </div>
  );
}
