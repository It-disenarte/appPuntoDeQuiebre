"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { clampSpeed, estimateSeconds, megabytes, PART_LABEL, PARTS, SPEED_LABEL, SPEEDS, type Part } from "@/lib/recording/rules";
import { onMobileData, queueAll, queueAvailable, queueDelete, queuePut, uploadPart, type QueueItem } from "./upload-queue";

type Done = { part: Part; id: string; seconds: number };
type Phase = "apagada" | "lista" | "cuenta" | "grabando" | "revision";

const MIMES = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
const pickMime = () => (typeof MediaRecorder === "undefined" ? "" : (MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ""));

export function RecordingStudio({ pieceId, texts, done }: { pieceId: string; texts: Record<Part, string>; done: Done[] }) {
  const router = useRouter();
  const doneParts = new Set(done.map((d) => d.part));
  const [part, setPart] = useState<Part>(() => PARTS.find((p) => !doneParts.has(p)) ?? "gancho");
  const [phase, setPhase] = useState<Phase>("apagada");
  const [error, setError] = useState("");
  const [speed, setSpeed] = useState(3);
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<{ url: string; blob: Blob; seconds: number; mime: string } | null>(null);
  const [queue, setQueue] = useState<(QueueItem & { pct?: number; msg?: string; waiting?: boolean })[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const promptRef = useRef<HTMLDivElement>(null);
  const flushing = useRef(false);

  const text = texts[part];
  const expected = estimateSeconds(text) * (2.5 / SPEEDS[speed - 1]!);

  /* ───── Cámara ───── */
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setError("Este navegador no puede grabar video. Prueba con Chrome o Safari actualizado.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", aspectRatio: { ideal: 3 / 4 }, width: { ideal: 960 }, height: { ideal: 1280 } }, audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      // Si la cámara permite acercar, se deja sin zoom para ver todo el encuadre (best-effort: no todos los celulares lo ofrecen).
      const track = stream.getVideoTracks()[0];
      const zoom = (track?.getCapabilities?.() as { zoom?: { min: number } } | undefined)?.zoom;
      if (track && zoom) await track.applyConstraints({ advanced: [{ zoom: zoom.min } as MediaTrackConstraintSet] }).catch(() => undefined);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setPhase("lista");
    } catch (e) {
      const name = (e as DOMException).name;
      setError(name === "NotAllowedError" ? "Permite el acceso a la cámara y al micrófono en tu navegador y vuelve a intentar." : "No pudimos abrir la cámara. Revisa que ninguna otra app la esté usando.");
    }
  }

  /* ───── Grabar ───── */
  function begin() {
    setError("");
    setPhase("cuenta");
    setCount(3);
    if (promptRef.current) promptRef.current.scrollTop = 0;
    let n = 3;
    const t = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) {
        clearInterval(t);
        record();
      }
    }, 1000);
  }

  function record() {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = pickMime();
    const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const seconds = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
      if (blob.size < 1000) {
        setError("La grabación salió vacía. Intenta de nuevo.");
        return setPhase("lista");
      }
      setTake({ url: URL.createObjectURL(blob), blob, seconds, mime: type });
      setPhase("revision");
    };
    recRef.current = rec;
    startRef.current = Date.now();
    rec.start(1000);
    setElapsed(0);
    setPhase("grabando");
  }
  const stop = () => recRef.current?.state === "recording" && recRef.current.stop();

  // Reloj y desplazamiento del teleprompter: el texto termina cuando se estima que acabas de decirlo.
  useEffect(() => {
    if (phase !== "grabando") return;
    let raf = 0;
    const tick = () => {
      const s = (Date.now() - startRef.current) / 1000;
      setElapsed(Math.floor(s));
      const el = promptRef.current;
      if (el) el.scrollTop = Math.min(1, s / Math.max(3, expected)) * (el.scrollHeight - el.clientHeight);
      if (s >= 180) return stop();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, expected]);

  useEffect(() => {
    const url = take?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [take]);

  /* ───── Cola de subidas ───── */
  const refreshQueue = useCallback(async () => {
    if (!queueAvailable()) return;
    const all = await queueAll().catch(() => [] as QueueItem[]);
    setQueue((prev) => all.filter((i) => i.pieceId === pieceId).map((i) => ({ ...i, ...(prev.find((p) => p.id === i.id) ? { msg: prev.find((p) => p.id === i.id)!.msg } : {}) })));
  }, [pieceId]);

  const flush = useCallback(
    async (allowMobile = false) => {
      if (flushing.current || !queueAvailable()) return;
      flushing.current = true;
      try {
        const all = (await queueAll().catch(() => [])).sort((a, b) => a.createdAt - b.createdAt);
        for (const item of all) {
          if (item.pieceId !== pieceId) continue;
          if (!allowMobile && onMobileData()) {
            setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, waiting: true } : x)));
            continue;
          }
          setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, pct: 0, waiting: false, msg: undefined } : x)));
          const err = await uploadPart(item, (pct) => setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, pct } : x))));
          if (!err) {
            await queueDelete(item.id);
            router.refresh();
          } else if (err.startsWith("!")) {
            await queueDelete(item.id);
            setError(err.slice(1));
          } else {
            await queuePut({ ...item, tries: item.tries + 1 });
            setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, pct: undefined, msg: err } : x)));
          }
        }
      } finally {
        flushing.current = false;
        await refreshQueue();
      }
    },
    [pieceId, refreshQueue, router],
  );

  useEffect(() => {
    const on = () => void flush();
    const first = setTimeout(() => void refreshQueue().then(() => flush()), 0);
    window.addEventListener("online", on);
    const t = setInterval(on, 30_000);
    return () => {
      clearTimeout(first);
      window.removeEventListener("online", on);
      clearInterval(t);
    };
  }, [flush, refreshQueue]);

  async function useTake() {
    if (!take) return;
    const item: QueueItem = { id: crypto.randomUUID(), pieceId, part, seconds: take.seconds, mime: take.mime, blob: take.blob, tries: 0, createdAt: Date.now() };
    if (!queueAvailable()) return setError("Tu navegador no permite guardar la grabación en el teléfono para subirla después.");
    try {
      await queuePut(item);
    } catch {
      return setError("No pudimos guardar la grabación en tu teléfono (¿poco espacio?).");
    }
    setTake(null);
    const next = PARTS.find((p) => p !== part && !doneParts.has(p));
    if (next) setPart(next);
    setPhase(streamRef.current ? "lista" : "apagada");
    await refreshQueue();
    void flush();
  }

  const pending = new Set(queue.map((q) => q.part));
  const complete = PARTS.every((p) => doneParts.has(p));

  return (
    // Sin selección de texto: al mantener pulsado, Chrome abría su buscador (“Tap to see search results”) en pleno estudio.
    <div className="flex flex-col gap-3 select-none [-webkit-touch-callout:none]" onContextMenu={(e) => e.preventDefault()}>
      <ol className="grid grid-cols-3 gap-1.5" aria-label="Partes del guion">
        {PARTS.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => (phase === "apagada" || phase === "lista") && setPart(p)}
              aria-current={p === part ? "step" : undefined}
              className="flex w-full flex-col gap-1.5 text-left disabled:opacity-60"
              disabled={phase === "cuenta" || phase === "grabando" || phase === "revision"}
            >
              <span className={cn("h-1 rounded-full", doneParts.has(p) ? "bg-exito" : pending.has(p) ? "bg-azul" : p === part ? "bg-naranja" : "bg-ink-700")} />
              <span className={cn("text-xs", p === part ? "font-extrabold text-naranja" : "text-ink-300")}>
                {PART_LABEL[p]}
                {doneParts.has(p) ? " ✓" : pending.has(p) ? " ↑" : ""}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="relative overflow-hidden rounded-card bg-ink-800">
        {phase === "revision" && take ? (
          <video src={take.url} controls playsInline className="mx-auto aspect-3/4 h-[42dvh] w-auto max-w-full bg-negro object-cover" />
        ) : (
          <div className="relative mx-auto aspect-3/4 h-[42dvh] w-auto max-w-full bg-negro">
            <video ref={videoRef} muted playsInline className="size-full -scale-x-100 object-cover" />
            {phase === "apagada" && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center">
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-ink-300">Te pediremos permiso para usar la cámara y el micrófono. El video solo se sube cuando tú lo aceptas.</p>
                  <button type="button" onClick={startCamera} className="tap rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
                    Abrir cámara
                  </button>
                </div>
              </div>
            )}
            {phase !== "apagada" && (
              <>
                <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
                  <div className="aspect-3/4 h-[62%] rounded-[50%] border-2 border-dashed border-blanco/50" />
                </div>
                <div ref={promptRef} className="absolute inset-x-0 top-0 max-h-[42%] overflow-y-auto bg-negro/65 p-4 text-xl leading-snug font-extrabold whitespace-pre-line" tabIndex={0} aria-label="Teleprompter">
                  {text || "Esta parte no tiene texto en el guion."}
                </div>
                {phase === "cuenta" && <div className="absolute inset-0 grid place-items-center bg-negro/40 text-8xl font-black">{count}</div>}
                {phase === "grabando" && (
                  <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-negro/70 px-3 py-1 text-xs font-bold" role="status">
                    <span className="size-2 animate-pulse rounded-full bg-alerta" aria-hidden /> {elapsed}s
                  </span>
                )}
              </>
            )}
          </div>
        )}
        <p className="p-3 text-center text-xs text-ink-400">{phase === "revision" ? "Míralo. Si no te convence, repite la parte." : "Coloca tu cara dentro de la guía · Luz frente a ti · Celular a la altura de los ojos"}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-alerta/15 p-3 text-sm text-blanco">
          {error}
        </p>
      )}

      {phase !== "revision" && (
        <div className="flex items-center gap-3 text-sm">
          <label htmlFor="vel" className="text-ink-300">
            Velocidad
          </label>
          <input id="vel" type="range" min={1} max={5} value={speed} onChange={(e) => setSpeed(clampSpeed(Number(e.target.value)))} className="flex-1 accent-blanco" disabled={phase === "grabando"} />
          <span className="w-24 text-right font-extrabold">{SPEED_LABEL[speed - 1]}</span>
        </div>
      )}

      <div className="sticky bottom-24 z-20 flex items-center justify-between gap-3 rounded-full bg-negro/85 px-3 py-2 backdrop-blur">
        {phase === "revision" ? (
          <>
            <button type="button" onClick={() => (setTake(null), setPhase("lista"))} className="tap rounded-full border border-ink-600 px-4 text-sm font-semibold">
              Repetir parte
            </button>
            <button type="button" onClick={useTake} className="tap rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
              Usar esta toma
            </button>
          </>
        ) : (
          <>
            <span className="w-24 text-xs text-ink-400">{doneParts.has(part) ? "Ya tienes esta parte. Grabar otra vez la reemplaza." : ""}</span>
            <button
              type="button"
              onClick={phase === "grabando" ? stop : begin}
              disabled={phase === "apagada" || phase === "cuenta"}
              aria-label={phase === "grabando" ? "Detener" : "Grabar"}
              className={cn("size-20 rounded-full border-4 border-blanco shadow-[0_0_0_4px_rgb(254_104_7/0.25)] disabled:opacity-40", phase === "grabando" ? "bg-alerta" : "bg-naranja")}
            >
              {phase === "grabando" && <span className="mx-auto block size-6 rounded bg-blanco" aria-hidden />}
            </button>
            <span className="w-24" />
          </>
        )}
      </div>

      {queue.length > 0 && (
        <div className="flex flex-col gap-2 rounded-card bg-ink-800 p-4 text-sm" aria-live="polite">
          <p className="font-extrabold">Subiendo tus grabaciones</p>
          {queue.map((q) => (
            <div key={q.id} className="flex flex-col gap-1">
              <p>
                {PART_LABEL[q.part as Part] ?? q.part} · {megabytes(q.blob.size)} MB
                {q.pct !== undefined ? ` · ${q.pct} %` : q.waiting ? " · esperando WiFi" : q.msg ? ` · ${q.msg}` : " · en cola"}
              </p>
              {q.pct !== undefined && (
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-700" role="progressbar" aria-valuenow={q.pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-naranja" style={{ width: `${q.pct}%` }} />
                </div>
              )}
            </div>
          ))}
          {queue.some((q) => q.waiting) && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-ink-300">Estás con datos móviles. Cada parte pesa varios MB: puedes esperar a tener WiFi (se sube sola) o subir ahora.</p>
              <button type="button" onClick={() => void flush(true)} className="tap self-start rounded-full bg-blanco px-4 text-sm font-semibold text-negro">
                Subir con datos móviles
              </button>
            </div>
          )}
          <p className="text-xs text-ink-400">Si se va el internet no pasa nada: la grabación queda en tu teléfono y se sube sola. No cierres la app hasta que termine.</p>
        </div>
      )}

      {complete && pending.size === 0 && <p className="rounded-xl bg-exito/20 p-3 text-sm font-semibold">¡Listo! Las 3 partes están subidas. Tu video quedó marcado como grabado.</p>}
    </div>
  );
}
