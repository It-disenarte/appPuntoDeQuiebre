"use client";

import { ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { Button, FormError } from "@/components/ui";
import { deletePhotoAction, startRevealAction, type KitActionState } from "@/lib/kit/actions";
import { submitKeepingState } from "@/lib/form-submit";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { errorText } from "@/lib/net-error";

type Photo = { id: string };
const MAX = 4;
const MIN = 3;
const ACCEPT = "image/jpeg,image/png,image/webp";

export function PhotoUploader({ photos }: { photos: Photo[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, action, pending] = useActionState<KitActionState, FormData>(startRevealAction, undefined);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const room = MAX - photos.length;
    for (const file of Array.from(files).slice(0, room)) {
      try {
        const res = await fetch("/api/kit/foto", { method: "POST", headers: { "Content-Type": file.type }, body: file });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "No se pudo subir la foto.");
      } catch (err) {
        setError(errorText(err, "No se pudo subir la foto."));
        break;
      }
    }
    if (input.current) input.current.value = "";
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {photos.map((p) => (
          <div key={p.id} className="relative overflow-hidden rounded-xl bg-ink-100" style={{ aspectRatio: "4 / 5" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/kit/foto/${p.id}`} alt="Foto subida" className="size-full object-cover" />
            <form action={deletePhotoAction} className="absolute right-1.5 top-1.5">
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" aria-label="Borrar esta foto" className="tap grid size-9 place-items-center rounded-full bg-negro/70 text-sm font-bold text-blanco">
                ✕
              </button>
            </form>
          </div>
        ))}
        {photos.length < MAX && (
          <label className="tap grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-ink-300 text-center text-sm font-semibold text-ink-600 hover:bg-ink-100" style={{ aspectRatio: "4 / 5" }}>
            <input ref={input} type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => upload(e.target.files)} disabled={busy} />
            <span className="flex flex-col items-center gap-1">
              <ImagePlus className="size-6" aria-hidden />
              {busy ? "Subiendo…" : "Subir fotos"}
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
        {photos.length} de {MAX} fotos (mínimo {MIN}). JPG, PNG o WebP de hasta 8 MB. Las reducimos y les quitamos los datos de ubicación.
      </p>
      <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2">
        <FormError message={state?.error} />
        <Button type="submit" size="lg" disabled={pending || photos.length < MIN} className="self-start">
          {pending && <LoadingOverlay title="Armando tu kit…" />}{pending ? "Armando tu kit…" : "Armar mi kit"}
        </Button>
      </form>
    </div>
  );
}
