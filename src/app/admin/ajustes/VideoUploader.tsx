"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, FormError, FormSuccess } from "@/components/ui";

const MAX = 500 * 1024 * 1024;
const TYPES = ["video/mp4", "video/webm", "video/quicktime"];

/** Sube con XMLHttpRequest para mostrar el avance (fetch no reporta progreso de subida). */
export function VideoUploader() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  function upload() {
    if (!file) return;
    if (!TYPES.includes(file.type)) return setError("Formato no permitido. Usa MP4, WebM o MOV.");
    if (file.size > MAX) return setError("El video supera 500 MB.");
    setError(undefined);
    setDone(false);
    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/media/bienvenida");
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        setDone(true);
        setFile(null);
        router.refresh();
      } else {
        try {
          setError(JSON.parse(xhr.responseText).error ?? "No se pudo subir el video.");
        } catch {
          setError("No se pudo subir el video.");
        }
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Se perdió la conexión durante la subida.");
    };
    xhr.send(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      {done && <FormSuccess message="Video actualizado." />}
      <input
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-azul-50 file:px-4 file:py-2 file:font-semibold file:text-azul"
        aria-label="Elegir video"
      />
      {progress !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-azul transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <Button type="button" onClick={upload} disabled={!file || progress !== null} className="self-start">
        {progress !== null ? `Subiendo… ${progress} %` : "Subir video"}
      </Button>
    </div>
  );
}
