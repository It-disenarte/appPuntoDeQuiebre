"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScriptReader } from "@/components/record/ScriptReader";
import { cn } from "@/components/ui";
import { clampSpeed, estimateSeconds, MAX_PART_BYTES, MAX_PART_SECONDS, megabytes, PART_LABEL, PARTS, SPEED_LABEL, SPEEDS, VIDEO_TYPES, type Part } from "@/lib/recording/rules";
import { onMobileData, queueAll, queueAvailable, queueDelete, queuePut, uploadPart, type QueueItem } from "./upload-queue";

type Done = { part: Part; id: string; seconds: number };
type Phase = "apagada" | "lista" | "cuenta" | "grabando" | "revision";

/** Tipo del archivo; algunos teléfonos no lo informan y hay que deducirlo de la extensión. */
function videoMime(f: File): string | null {
  const t = f.type.split(";")[0]!.trim().toLowerCase();
  if (t in VIDEO_TYPES) return t;
  const ext = f.name.split(".").pop()?.toLowerCase();
  return ext === "mp4" || ext === "m4v" ? "video/mp4" : ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : null;
}

/** Por ahora la grabación dentro del navegador está apagada: se graba con la cámara nativa del teléfono y el teleprompter flotante. */
const IN_APP_CAMERA = false;

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
  /** Proporción real de lo que entrega la cámara (ancho/alto): la vista previa la respeta, sin recortar ni acercar. */
  const [aspect, setAspect] = useState(9 / 16);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState("");
  const [rawAudio, setRawAudio] = useState(false);
  const [level, setLevel] = useState(0);
  const [audioKey, setAudioKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
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

  const audioConstraints = (id: string, raw: boolean): MediaTrackConstraints => ({
    ...(id ? { deviceId: { exact: id } } : {}),
    echoCancellation: !raw,
    noiseSuppression: !raw,
    autoGainControl: !raw,
  });

  const [micNote, setMicNote] = useState("");
  const [activeMic, setActiveMic] = useState("");
  const micCount = useRef(0);
  const phaseRef = useRef<Phase>(phase);
  const changeMicRef = useRef<(id: string, raw?: boolean) => Promise<void>>(async () => undefined);
  const refreshMics = useCallback(async () => {
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      setMics(all);
      const before = micCount.current;
      micCount.current = all.length;
      // Se conectó un micrófono con la cámara abierta: se toma el audio de nuevo para que el teléfono use el nuevo, y sin filtros
      // (en Android los micrófonos USB solo se respetan sin cancelación de eco).
      if (before > 0 && all.length > before && streamRef.current && phaseRef.current === "lista") {
        setMicNote("Detecté un micrófono nuevo y lo activé sin filtros. Habla y mira que la barra se mueva.");
        void changeMicRef.current("", true);
      }
    } catch {
      /* sin lista: se queda el micrófono predeterminado */
    }
  }, []);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener("devicechange", refreshMics); // al conectar o quitar un micrófono
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshMics);
  }, [refreshMics]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /** Cambia el micrófono sin reiniciar la cámara: se sustituye solo la pista de audio. */
  async function changeMic(id: string, raw = rawAudio) {
    const stream = streamRef.current;
    if (!stream) return;
    setError("");
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(id, raw) });
      stream.getAudioTracks().forEach((t) => (stream.removeTrack(t), t.stop()));
      next.getAudioTracks().forEach((t) => stream.addTrack(t));
      setMicId(id);
      setRawAudio(raw);
      setAudioKey((k) => k + 1);
      try {
        localStorage.setItem("pdq-mic", id);
      } catch {
        /* sin almacenamiento: no se recuerda */
      }
    } catch {
      setError("No pudimos usar ese micrófono. Revisa que esté bien conectado y elige otro.");
    }
  }

  useEffect(() => {
    changeMicRef.current = changeMic;
  });

  // Nombre del micrófono que de verdad está en uso (para comprobar que es el externo).
  useEffect(() => {
    setActiveMic(streamRef.current?.getAudioTracks()[0]?.label ?? "");
  }, [audioKey]);

  // Medidor de nivel: sirve para comprobar que el micrófono elegido (p. ej. uno externo) de verdad está captando.
  useEffect(() => {
    const stream = streamRef.current;
    if (phase === "apagada" || !stream || stream.getAudioTracks().length === 0) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(Math.min(1, peak / 90));
    }, 90);
    return () => {
      clearInterval(timer);
      void ctx.close().catch(() => undefined);
    };
  }, [phase === "apagada", audioKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setError("Este navegador no puede grabar video. Prueba con Chrome o Safari actualizado.");
    try {
      let remembered = "";
      try {
        remembered = localStorage.getItem("pdq-mic") ?? "";
      } catch {
        /* sin almacenamiento */
      }
      // Vertical completo (9:16), como el modo video de la cámara del teléfono: sin recortar el encuadre.
      const video: MediaTrackConstraints = { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 }, frameRate: { ideal: 30 } };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: audioConstraints(remembered, rawAudio) });
      } catch (err) {
        // Si el micrófono recordado ya no está conectado, se vuelve al predeterminado.
        if (!remembered || (err as DOMException).name === "NotAllowedError") throw err;
        remembered = "";
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: audioConstraints("", rawAudio) });
      }
      setMicId(remembered);
      setAudioKey((k) => k + 1);
      void refreshMics();
      streamRef.current = stream;
      // Si la cámara permite acercar, se deja sin zoom para ver todo el encuadre (best-effort: no todos los celulares lo ofrecen).
      const track = stream.getVideoTracks()[0];
      const zoom = (track?.getCapabilities?.() as { zoom?: { min: number } } | undefined)?.zoom;
      // Zoom en 1× (el mínimo que ofrece la cámara), igual que la app de cámara; algunos teléfonos arrancan acercados.
      if (track && zoom) await track.applyConstraints({ advanced: [{ zoom: zoom.min } as MediaTrackConstraintSet] }).catch(() => undefined);
      const st = track?.getSettings?.();
      if (st?.width && st?.height) setAspect(st.width / st.height);
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
    const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
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

  /** Video hecho con la cámara del teléfono (o elegido de la galería): se revisa igual que una toma grabada aquí. */
  async function pickNative(file: File | undefined) {
    if (!file) return;
    setError("");
    const mime = videoMime(file);
    if (!mime) return setError("Ese archivo no es un video compatible (MP4, MOV o WebM).");
    if (file.size > MAX_PART_BYTES) return setError(`El video pesa demasiado (máximo ${Math.round(MAX_PART_BYTES / 1048576)} MB). Graba esta parte más corta.`);
    const url = URL.createObjectURL(file);
    const seconds = await new Promise<number>((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : 0);
      v.onerror = () => resolve(0);
      v.src = url;
    });
    if (seconds > MAX_PART_SECONDS) {
      URL.revokeObjectURL(url);
      return setError(`Cada parte puede durar máximo ${MAX_PART_SECONDS} segundos. Graba esta parte más corta.`);
    }
    // Si el navegador no pudo leer la duración (formatos como HEVC), se sube igual con un valor aproximado.
    setTake({ url, blob: file, seconds: seconds || Math.round(estimateSeconds(text)), mime });
    setPhase("revision");
  }

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

      <div className="flex flex-col gap-3 rounded-card bg-ink-800 p-4 text-sm">
        <div>
          <p className="font-extrabold">Grabar «{PART_LABEL[part]}»</p>
          <p className="mt-1 text-xs text-ink-300">Se abre el teleprompter chiquito encima y luego la cámara de tu teléfono (con tu micrófono externo, a máxima calidad). Elige la parte arriba.</p>
        </div>
        <ScriptReader key={part} floatingOnly openLabel={`Grabar «${PART_LABEL[part]}»`} text={text} onClose={() => undefined} onOpened={() => nativeRef.current?.click()} />
        <label className="tap inline-flex cursor-pointer items-center self-start rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
          <input ref={nativeRef} type="file" accept="video/*" capture="user" className="sr-only" onChange={(e) => (void pickNative(e.target.files?.[0]), (e.target.value = ""))} />
          Abrir la cámara del teléfono
        </label>
        <p className="text-xs text-ink-300">Si la cámara no se abre sola, toca este botón. En la cámara empieza a grabar, toca ▶ en la ventana flotante y lee. Al terminar vuelve aquí: el video se sube solo.</p>
        <label className="tap inline-flex cursor-pointer items-center self-start text-xs font-semibold underline underline-offset-4">
          <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" className="sr-only" onChange={(e) => (void pickNative(e.target.files?.[0]), (e.target.value = ""))} />
          O elegir un video de mi galería
        </label>
      </div>


      {IN_APP_CAMERA && (
      <>
      <div className="relative overflow-hidden rounded-card bg-ink-800">
        {phase === "revision" && take ? (
          <video src={take.url} controls playsInline style={{ aspectRatio: aspect }} className="mx-auto h-[52dvh] w-auto max-w-full bg-negro object-contain" />
        ) : (
          <div style={{ aspectRatio: aspect }} className="relative mx-auto h-[52dvh] w-auto max-w-full bg-negro">
            <video ref={videoRef} muted playsInline className="size-full -scale-x-100 object-contain" />
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

      {phase !== "apagada" && phase !== "revision" && (
        <div className="flex flex-col gap-2 rounded-xl bg-ink-800 p-3 text-sm">
          <label htmlFor="mic" className="font-semibold">
            Micrófono
          </label>
          <select
            id="mic"
            value={micId}
            onChange={(e) => void changeMic(e.target.value)}
            disabled={phase === "cuenta" || phase === "grabando"}
            className="h-11 rounded-lg border border-ink-600 bg-ink-900 px-3 text-base text-blanco disabled:opacity-50"
          >
            <option value="">Predeterminado del teléfono</option>
            {mics
              .filter((m) => m.deviceId && m.deviceId !== "default")
              .map((m, i) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || `Micrófono ${i + 1}`}
                </option>
              ))}
          </select>
          <div className="h-2 overflow-hidden rounded-full bg-ink-700" role="meter" aria-label="Nivel del micrófono" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
            <div className="h-full rounded-full bg-exito transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <p className="text-xs text-ink-300">Habla y mira que la barra se mueva. Si conectas un micrófono externo, elígelo aquí.</p>
          <p className="text-xs text-ink-300">¿No ves tu micrófono USB (DJI, etc.)? Conéctalo, espera unos segundos y activa «Audio sin filtros»: en Android, sin esa opción el teléfono sigue usando su micrófono interno. Si aun así la barra no se mueve, usa «Abrir la cámara del teléfono», que sí lo detecta.</p>
          {micNote && <p className="text-xs font-semibold text-naranja">{micNote}</p>}
          {mics.length > 0 && !mics.some((m) => /usb|dji|wireless|bluetooth|extern/i.test(m.label)) && (
            <p role="status" className="rounded-lg bg-naranja-100 p-2 text-xs font-semibold text-ink-900">
              El teléfono no le está pasando tu micrófono USB al navegador (solo ve los internos). Para grabar con él usa «Abrir la cámara del teléfono» (abajo): la cámara nativa sí lo reconoce.
            </p>
          )}
          <p className="text-xs text-ink-300">
            En uso: <strong className="text-blanco">{activeMic || "micrófono predeterminado"}</strong>
          </p>
          <details className="text-xs text-ink-300">
            <summary className="cursor-pointer font-semibold">Ver los micrófonos que detecta tu teléfono ({mics.length})</summary>
            <ul className="mt-1 list-disc pl-5">
              {mics.length === 0 && <li>Ninguno todavía (se ven después de dar el permiso).</li>}
              {mics.map((m, i) => (
                <li key={m.deviceId || i}>{m.label || "(sin nombre)"} {m.deviceId ? `· ${m.deviceId.slice(0, 8)}` : ""}</li>
              ))}
            </ul>
            <p className="mt-1">Si tu micrófono USB no está en esta lista, el navegador del teléfono no lo expone: usa la cámara nativa (video) o una grabadora y sube el audio (voz en off).</p>
          </details>
          <label className="flex items-center gap-2 text-xs text-ink-300">
            <input type="checkbox" checked={rawAudio} onChange={(e) => void changeMic(micId, e.target.checked)} disabled={phase === "cuenta" || phase === "grabando"} className="size-4 accent-blanco" />
            Audio sin filtros (recomendado con micrófono externo)
          </label>
        </div>
      )}
      </>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-alerta/15 p-3 text-sm text-blanco">
          {error}
        </p>
      )}

      {IN_APP_CAMERA && (
      <>
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
            <button type="button" onClick={() => (setTake(null), setPhase(streamRef.current ? "lista" : "apagada"))} className="tap rounded-full border border-ink-600 px-4 text-sm font-semibold">
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
      </>
      )}

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
