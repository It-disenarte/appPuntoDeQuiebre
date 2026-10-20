"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { VO_MAX_AUDIO_BYTES, VO_MAX_SECONDS, VOICE_FILE_TYPES } from "@/lib/edit/vo-rules";
import { clampSpeed, estimateSeconds, megabytes, SPEED_LABEL, SPEEDS } from "@/lib/recording/rules";

type Phase = "apagada" | "lista" | "cuenta" | "grabando" | "revision";

const MIMES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
const pickMime = () => (typeof MediaRecorder === "undefined" ? "" : (MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ""));
const baseOf = (t: string) => t.split(";")[0]!.trim().toLowerCase();

function audioDuration(blobOrFile: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blobOrFile);
    const a = new Audio();
    a.preload = "metadata";
    const done = (n: number) => (URL.revokeObjectURL(url), resolve(n));
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration) : 0);
    a.onerror = () => done(0);
    a.src = url;
  });
}

/** Graba la voz en off con el guion en un teleprompter y el micrófono que se elija, o sube un audio ya grabado. */
export function VoiceRecorder({ pieceId, text, hasVoice }: { pieceId: string; text: string; hasVoice: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("apagada");
  const [error, setError] = useState("");
  const [speed, setSpeed] = useState(3);
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<{ url: string; blob: Blob; seconds: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState("");
  const [rawAudio, setRawAudio] = useState(false);
  const [level, setLevel] = useState(0);
  const [audioKey, setAudioKey] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const promptRef = useRef<HTMLDivElement>(null);
  const expected = estimateSeconds(text) * (2.5 / SPEEDS[speed - 1]!);

  const audioConstraints = (id: string, raw: boolean): MediaTrackConstraints => ({ ...(id ? { deviceId: { exact: id } } : {}), echoCancellation: !raw, noiseSuppression: !raw, autoGainControl: !raw });

  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopMic, [stopMic]);

  const [micNote, setMicNote] = useState("");
  const micCount = useRef(0);
  const phaseRef = useRef<Phase>(phase);
  const openMicRef = useRef<(id?: string, raw?: boolean) => Promise<void>>(async () => undefined);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const refreshMics = useCallback(async () => {
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      setMics(all);
      const before = micCount.current;
      micCount.current = all.length;
      // Se conectó un micrófono con el micrófono abierto: se toma de nuevo, sin filtros (los USB de Android lo requieren).
      if (before > 0 && all.length > before && streamRef.current && phaseRef.current === "lista") {
        setMicNote("Detecté un micrófono nuevo y lo activé sin filtros. Habla y mira que la barra se mueva.");
        void openMicRef.current("", true);
      }
    } catch {
      /* sin lista */
    }
  }, []);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener("devicechange", refreshMics);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshMics);
  }, [refreshMics]);

  async function openMic(id = micId, raw = rawAudio) {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setError("Este navegador no puede grabar audio. Prueba con Chrome o Safari actualizado, o sube un audio ya grabado.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(id, raw) });
      stopMic();
      streamRef.current = stream;
      setMicId(id);
      setRawAudio(raw);
      setAudioKey((k) => k + 1);
      void refreshMics();
      setPhase((p) => (p === "apagada" ? "lista" : p));
    } catch (e) {
      setError((e as DOMException).name === "NotAllowedError" ? "Permite el acceso al micrófono en tu navegador y vuelve a intentar." : "No pudimos usar ese micrófono. Revisa que esté bien conectado.");
    }
  }

  useEffect(() => {
    openMicRef.current = openMic;
  });

  // Medidor de nivel (para comprobar que el micrófono elegido de verdad capta).
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream || phase === "apagada") return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
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
    const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 160_000 });
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const type = baseOf(rec.mimeType || mime || "audio/webm");
      const blob = new Blob(chunksRef.current, { type });
      const seconds = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
      if (blob.size < 500) {
        setError("La grabación salió vacía. Intenta de nuevo.");
        return setPhase("lista");
      }
      setTake({ url: URL.createObjectURL(blob), blob, seconds });
      setPhase("revision");
    };
    recRef.current = rec;
    startRef.current = Date.now();
    rec.start(1000);
    setElapsed(0);
    setPhase("grabando");
  }
  const stop = () => recRef.current?.state === "recording" && recRef.current.stop();

  useEffect(() => {
    if (phase !== "grabando") return;
    let raf = 0;
    const tick = () => {
      const s = (Date.now() - startRef.current) / 1000;
      setElapsed(Math.floor(s));
      const el = promptRef.current;
      if (el) el.scrollTop = Math.min(1, s / Math.max(3, expected)) * (el.scrollHeight - el.clientHeight);
      if (s >= VO_MAX_SECONDS) return stop();
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

  async function send(blob: Blob, seconds: number) {
    const type = baseOf(blob.type);
    if (blob.size > VO_MAX_AUDIO_BYTES) return setError("El audio pesa demasiado (máximo 40 MB).");
    setUploading(true);
    setError("");
    try {
      const res = await fetch(`/api/grabaciones/voz?pieza=${encodeURIComponent(pieceId)}&segundos=${seconds}`, { method: "POST", headers: { "Content-Type": type }, body: blob });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "No se pudo subir tu voz.");
      }
      setTake(null);
      stopMic();
      setPhase("apagada");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sin conexión. Intenta de nuevo con WiFi.");
    } finally {
      setUploading(false);
    }
  }

  async function pickFile(file?: File) {
    if (!file) return;
    const type = VOICE_FILE_TYPES[baseOf(file.type)] ?? (/\.(m4a|mp4|aac)$/i.test(file.name) ? "audio/mp4" : /\.mp3$/i.test(file.name) ? "audio/mpeg" : /\.webm$/i.test(file.name) ? "audio/webm" : /\.ogg$/i.test(file.name) ? "audio/ogg" : "");
    if (!type) return setError("Ese formato de audio no es compatible. Usa M4A, MP3, WebM u OGG.");
    const seconds = await audioDuration(file);
    if (seconds < 3) return setError("No pudimos leer la duración del audio o es muy corto.");
    await send(new Blob([file], { type }), seconds);
  }

  const busy = phase === "cuenta" || phase === "grabando";

  return (
    <div className="flex flex-col gap-3">
      {uploading && <LoadingOverlay title="Subiendo tu voz…" hint="Un momento." />}

      {phase === "apagada" && (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => void openMic()} className="tap self-start rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
            {hasVoice ? "Grabar la voz otra vez" : "Grabar mi voz"}
          </button>
          <label className="tap inline-flex cursor-pointer items-center self-start rounded-full border border-ink-600 px-5 text-sm font-semibold">
            <input type="file" accept="audio/*,.m4a,.mp3,.aac,.ogg,.webm" className="sr-only" onChange={(e) => (void pickFile(e.target.files?.[0]), (e.target.value = ""))} />
            Subir un audio que ya tengo
          </label>
          <p className="text-xs text-ink-300">Hasta {VO_MAX_SECONDS / 60} minutos. Te pediremos permiso para usar el micrófono.</p>
        </div>
      )}

      {phase !== "apagada" && phase !== "revision" && (
        <>
          <div className="relative overflow-hidden rounded-card bg-negro">
            <div ref={promptRef} className="h-[34dvh] overflow-y-auto p-4 text-xl leading-snug font-extrabold whitespace-pre-line" tabIndex={0} aria-label="Teleprompter">
              {text || "Esta pieza no tiene guion: di lo que quieras."}
            </div>
            {phase === "cuenta" && <div className="absolute inset-0 grid place-items-center bg-negro/60 text-8xl font-black">{count}</div>}
            {phase === "grabando" && (
              <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-ink-800 px-3 py-1 text-xs font-bold" role="status">
                <span className="size-2 animate-pulse rounded-full bg-alerta" aria-hidden /> {elapsed}s
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-sm">
            <label htmlFor="vo-vel" className="text-ink-300">
              Velocidad
            </label>
            <input id="vo-vel" type="range" min={1} max={5} value={speed} onChange={(e) => setSpeed(clampSpeed(Number(e.target.value)))} className="flex-1 accent-blanco" disabled={phase === "grabando"} />
            <span className="w-24 text-right font-extrabold">{SPEED_LABEL[speed - 1]}</span>
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-ink-700 p-3 text-sm">
            <label htmlFor="vo-mic" className="font-semibold">
              Micrófono
            </label>
            <select id="vo-mic" value={micId} onChange={(e) => void openMic(e.target.value)} disabled={busy} className="h-11 rounded-lg border border-ink-600 bg-ink-900 px-3 text-base text-blanco disabled:opacity-50">
              <option value="">Predeterminado del teléfono</option>
              {mics
                .filter((m) => m.deviceId && m.deviceId !== "default")
                .map((m, i) => (
                  <option key={m.deviceId} value={m.deviceId}>
                    {m.label || `Micrófono ${i + 1}`}
                  </option>
                ))}
            </select>
            <div className="h-2 overflow-hidden rounded-full bg-ink-600" role="meter" aria-label="Nivel del micrófono" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
              <div className="h-full rounded-full bg-exito transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
            <p className="text-xs text-ink-300">Habla y mira que la barra se mueva. Con un micrófono externo, elígelo aquí.</p>
            <p className="text-xs text-ink-300">¿No ves tu micrófono USB (DJI, etc.)? Conéctalo, espera unos segundos y activa «Audio sin filtros»: en Android, sin esa opción el teléfono sigue usando su micrófono interno. Si aun así la barra no se mueve, usa una app de grabadora de voz y sube el audio.</p>
          {micNote && <p className="text-xs font-semibold text-naranja">{micNote}</p>}
            <label className="flex items-center gap-2 text-xs text-ink-300">
              <input type="checkbox" checked={rawAudio} onChange={(e) => void openMic(micId, e.target.checked)} disabled={busy} className="size-4 accent-blanco" />
              Audio sin filtros (recomendado con micrófono externo)
            </label>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => (stopMic(), setPhase("apagada"))} disabled={busy} className="tap rounded-full border border-ink-600 px-4 text-sm font-semibold disabled:opacity-40">
              Cancelar
            </button>
            <button
              type="button"
              onClick={phase === "grabando" ? stop : begin}
              disabled={phase === "cuenta"}
              aria-label={phase === "grabando" ? "Detener" : "Grabar"}
              className={cn("size-20 rounded-full border-4 border-blanco shadow-[0_0_0_4px_rgb(254_104_7/0.25)] disabled:opacity-40", phase === "grabando" ? "bg-alerta" : "bg-naranja")}
            >
              {phase === "grabando" && <span className="mx-auto block size-6 rounded bg-blanco" aria-hidden />}
            </button>
            <span className="w-20" />
          </div>
        </>
      )}

      {phase === "revision" && take && (
        <div className="flex flex-col gap-3 rounded-xl bg-ink-700 p-3">
          <p className="text-sm font-semibold">Escúchala · {take.seconds} s · {megabytes(take.blob.size)} MB</p>
          <audio src={take.url} controls className="w-full" />
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => (setTake(null), setPhase("lista"))} className="tap rounded-full border border-ink-600 px-4 text-sm font-semibold">
              Repetir
            </button>
            <button type="button" onClick={() => void send(take.blob, take.seconds)} className="tap rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
              Usar esta voz
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-alerta/15 p-3 text-sm text-blanco">
          {error}
        </p>
      )}
    </div>
  );
}
