"use client";

import { Mic, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button, cn, FormError, TextAreaField } from "@/components/ui";
import { saveVoiceTextAction, type BrujulaState } from "@/lib/brujula/actions";
import { VOICE_MAX_SECONDS, VOICE_MIN_SECONDS, VOICE_MIN_WORDS_TEXT, VOICE_TOPICS } from "@/lib/brujula/voice";

type Phase = "idle" | "recording" | "recorded" | "uploading";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function Recorder({ topic }: { topic: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const stream = useRef<MediaStream | null>(null);

  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => () => cleanup(), []);
  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const stop = () => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  };

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Tu navegador no permite grabar audio. Usa la opción de escribir tu muestra.");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("No pudimos usar tu micrófono. Revisa el permiso del navegador o usa la opción de escribir.");
      return;
    }
    const mime = pickMime();
    const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    rec.onstop = () => {
      cleanup();
      const blob = new Blob(chunks.current, { type: rec.mimeType || mime || "audio/webm" });
      blobRef.current = blob;
      setAudioUrl(URL.createObjectURL(blob));
      setPhase("recorded");
    };
    recorder.current = rec;
    rec.start(1000);
    secondsRef.current = 0;
    setSeconds(0);
    setPhase("recording");
    timer.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= VOICE_MAX_SECONDS) stop();
    }, 1000);
  }

  function reset() {
    setAudioUrl(null);
    blobRef.current = null;
    setSeconds(0);
    setPhase("idle");
  }

  async function upload() {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase("uploading");
    setError(null);
    try {
      const res = await fetch(`/api/voz?tema=${encodeURIComponent(topic)}&segundos=${secondsRef.current}`, {
        method: "POST",
        headers: { "Content-Type": blob.type.split(";")[0]! },
        body: blob,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar tu audio.");
      router.push("/mi-marca/voz?listo=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar tu audio.");
      setPhase("recorded");
    }
  }

  const enough = seconds >= VOICE_MIN_SECONDS;

  return (
    <div className="flex flex-col items-center gap-4 rounded-card bg-negro p-6 text-blanco">
      <p className="font-display text-6xl tabular-nums" aria-live="off">
        {fmt(seconds)}
      </p>
      <p className="text-sm text-ink-300">
        {phase === "idle" && `Graba entre ${fmt(VOICE_MIN_SECONDS)} y ${fmt(VOICE_MAX_SECONDS)} minutos.`}
        {phase === "recording" && (enough ? "Ya puedes detener cuando quieras." : `Sigue hablando: faltan ${VOICE_MIN_SECONDS - seconds} s para el mínimo.`)}
        {phase === "recorded" && "Escúchalo y envíalo, o grábalo de nuevo."}
        {phase === "uploading" && "Analizando tu voz…"}
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-alerta-100 px-4 py-2 text-sm font-semibold text-alerta">
          {error}
        </p>
      )}
      {phase === "idle" && (
        <Button type="button" variant="accent" size="lg" onClick={start}>
          <Mic className="size-5" aria-hidden /> Empezar a grabar
        </Button>
      )}
      {phase === "recording" && (
        <Button type="button" variant="light" size="lg" onClick={stop} disabled={!enough}>
          <Square className="size-5" aria-hidden /> Detener
        </Button>
      )}
      {(phase === "recorded" || phase === "uploading") && audioUrl && (
        <>
          <audio src={audioUrl} controls className="w-full" />
          <div className="flex flex-wrap justify-center gap-3">
            <Button type="button" variant="accent" onClick={upload} disabled={phase === "uploading" || seconds < VOICE_MIN_SECONDS}>
              {phase === "uploading" ? "Enviando…" : "Enviar mi muestra"}
            </Button>
            <Button type="button" variant="ghost" className="text-blanco hover:bg-ink-800" onClick={reset} disabled={phase === "uploading"}>
              Grabar de nuevo
            </Button>
          </div>
          {seconds < VOICE_MIN_SECONDS && <p className="text-xs text-ink-300">Tu audio es muy corto. Necesitamos al menos {fmt(VOICE_MIN_SECONDS)}.</p>}
        </>
      )}
    </div>
  );
}

function TextSample({ topic }: { topic: string }) {
  const [state, action, pending] = useActionState<BrujulaState, FormData>(saveVoiceTextAction, undefined);
  const text = typeof state?.fields?.text === "string" ? state.fields.text : "";
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="topic" value={topic} />
      <FormError message={state?.error} />
      <TextAreaField
        label={`Escribe como si estuvieras hablando (mínimo ${VOICE_MIN_WORDS_TEXT} palabras)`}
        name="text"
        defaultValue={text}
        maxLength={8000}
        className="[&_textarea]:min-h-56"
      />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Analizando…" : "Analizar mi texto"}
      </Button>
    </form>
  );
}

export function VoiceCapture({ defaultTopic }: { defaultTopic: string }) {
  const [topic, setTopic] = useState(defaultTopic);
  const [mode, setMode] = useState<"audio" | "texto">("audio");
  const current = VOICE_TOPICS.find((t) => t.value === topic) ?? VOICE_TOPICS[0];

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-ink-800">Elige un tema</legend>
        <div className="flex flex-wrap gap-2">
          {VOICE_TOPICS.map((t) => (
            <label
              key={t.value}
              className={cn(
                "tap inline-flex cursor-pointer items-center rounded-full border px-4 text-sm font-semibold select-none",
                topic === t.value ? "border-azul bg-azul text-blanco" : "border-ink-300 bg-blanco text-ink-800 hover:bg-ink-100",
              )}
            >
              <input type="radio" name="topicPick" value={t.value} checked={topic === t.value} onChange={() => setTopic(t.value)} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="rounded-xl bg-azul-50 p-4 text-sm text-ink-800">{current.prompt}</p>

      <div role="tablist" aria-label="Cómo dar tu muestra" className="flex gap-1 rounded-full bg-ink-200 p-1 self-start">
        {(["audio", "texto"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn("tap rounded-full px-4 text-sm font-semibold", mode === m ? "bg-blanco text-ink-900 shadow-card" : "text-ink-600")}
          >
            {m === "audio" ? "Grabar con el teléfono" : "Prefiero escribir"}
          </button>
        ))}
      </div>

      {mode === "audio" ? <Recorder topic={topic} /> : <TextSample topic={topic} />}
    </div>
  );
}
