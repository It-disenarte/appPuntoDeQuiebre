"use client";

import { Mic, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button, cn, FormError } from "@/components/ui";
import { saveStepTextAction, skipStepAction, type BrujulaState } from "@/lib/brujula/actions";
import { MAX_STEP_SECONDS, STORY_CHOICES, wordCount } from "@/lib/brujula/content";
import { submitKeepingState } from "@/lib/form-submit";

type Step = { id: string; minSeconds: number; minWords: number; followUp: string };
type Phase = "idle" | "recording" | "recorded" | "uploading";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="w-full">
      <div className="h-2 overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}>
        <div className={cn("h-full rounded-full transition-all", value >= max ? "bg-exito" : "bg-azul")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Recorder({ step, choice }: { step: Step; choice: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warned, setWarned] = useState(false);
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
      setError("Tu navegador no permite grabar audio. Usa la opción de escribir.");
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
    setWarned(false);
    setPhase("recording");
    timer.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= MAX_STEP_SECONDS) stop();
    }, 1000);
  }

  function reset() {
    setAudioUrl(null);
    blobRef.current = null;
    setSeconds(0);
    setWarned(false);
    setError(null);
    setPhase("idle");
  }

  async function upload() {
    const blob = blobRef.current;
    if (!blob) return;
    // Una sola repregunta amable si quedó corta; la segunda vez se envía tal cual.
    if (secondsRef.current < step.minSeconds && !warned) {
      setWarned(true);
      return;
    }
    setPhase("uploading");
    setError(null);
    try {
      const qs = new URLSearchParams({ paso: step.id, segundos: String(secondsRef.current) });
      if (warned) qs.set("insistir", "1");
      if (step.id === "historia") qs.set("eleccion", choice);
      const res = await fetch(`/api/historia/audio?${qs}`, { method: "POST", headers: { "Content-Type": blob.type.split(";")[0]! }, body: blob });
      const data = (await res.json().catch(() => ({}))) as { error?: string; next?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar tu audio.");
      router.push(data.next ?? "/mi-marca/historia");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar tu audio.");
      setPhase("recorded");
    }
  }

  const enough = seconds >= step.minSeconds;
  const needsChoice = step.id === "historia" && !choice;

  return (
    <div className="flex flex-col items-center gap-4 rounded-card bg-negro p-6 text-blanco">
      <p className="font-display text-6xl tabular-nums">{fmt(seconds)}</p>
      <Progress value={seconds} max={step.minSeconds} label="Tiempo hablado" />
      <p className="text-sm text-ink-300">
        {phase === "idle" && `Habla al menos ${step.minSeconds} segundos. Puedes parar cuando quieras.`}
        {phase === "recording" && (enough ? "¡Muy bien! Puedes seguir o detener cuando termines." : "Sigue, cuéntanos más…")}
        {phase === "recorded" && "Escúchalo y envíalo, o grábalo de nuevo."}
        {phase === "uploading" && "Procesando tu respuesta…"}
      </p>
      {warned && phase === "recorded" && <p className="rounded-xl bg-azul-50 px-4 py-3 text-sm text-ink-900">{step.followUp} Puedes grabar de nuevo, o enviarla así.</p>}
      {error && (
        <p role="alert" className="rounded-xl bg-alerta-100 px-4 py-2 text-sm font-semibold text-alerta">
          {error}
        </p>
      )}
      {phase === "idle" && (
        <Button type="button" variant="accent" size="lg" onClick={start} disabled={needsChoice}>
          <Mic className="size-5" aria-hidden /> Empezar a grabar
        </Button>
      )}
      {needsChoice && phase === "idle" && <p className="text-xs text-ink-300">Elige primero qué historia vas a contar.</p>}
      {phase === "recording" && (
        <Button type="button" variant="light" size="lg" onClick={stop}>
          <Square className="size-5" aria-hidden /> Detener
        </Button>
      )}
      {(phase === "recorded" || phase === "uploading") && audioUrl && (
        <>
          <audio src={audioUrl} controls className="w-full" />
          <div className="flex flex-wrap justify-center gap-3">
            <Button type="button" variant="accent" onClick={upload} disabled={phase === "uploading"}>
              {phase === "uploading" ? "Enviando…" : warned ? "Enviar así" : "Enviar respuesta"}
            </Button>
            <Button type="button" variant="ghost" className="text-blanco hover:bg-ink-800" onClick={reset} disabled={phase === "uploading"}>
              Grabar de nuevo
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function TextAnswer({ step, choice, initial }: { step: Step; choice: string; initial: string }) {
  const [state, action, pending] = useActionState<BrujulaState, FormData>(saveStepTextAction, undefined);
  const saved = typeof state?.fields?.text === "string" ? state.fields.text : initial;
  const [text, setText] = useState(saved);
  const words = wordCount(text);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-3">
      <input type="hidden" name="step" value={step.id} />
      <input type="hidden" name="choice" value={choice} />
      <input type="hidden" name="insisted" value={state?.followUp ? "1" : "0"} />
      <FormError message={state?.error} />
      <label htmlFor="text" className="text-sm font-semibold text-ink-800">
        Escribe como si estuvieras hablando
      </label>
      <textarea
        id="text"
        name="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={6000}
        className="min-h-56 rounded-xl border border-ink-300 bg-blanco px-4 py-3 text-base text-ink-900 outline-none transition focus:border-azul focus:ring-4 focus:ring-azul/15"
      />
      <Progress value={words} max={step.minWords} label="Palabras escritas" />
      <p className="text-xs text-ink-500">
        {words} de {step.minWords} palabras{words >= step.minWords ? " · ¡listo!" : " · sigue, cuéntanos más"}
      </p>
      <Button type="submit" size="lg" disabled={pending || (step.id === "historia" && !choice)} className="self-start">
        {pending ? "Guardando…" : "Continuar"}
      </Button>
    </form>
  );
}

export function StepCapture({ step, initialText, initialChoice }: { step: Step; initialText: string; initialChoice: string }) {
  const [mode, setMode] = useState<"voz" | "texto">("voz");
  const [choice, setChoice] = useState(initialChoice);

  return (
    <div className="flex flex-col gap-4">
      {step.id === "historia" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-ink-800">¿Cuál vas a contar?</legend>
          <div className="flex flex-wrap gap-2">
            {STORY_CHOICES.map((c) => (
              <label
                key={c.value}
                className={cn(
                  "tap inline-flex cursor-pointer items-center rounded-full border px-4 text-sm font-semibold select-none",
                  choice === c.value ? "border-azul bg-azul text-blanco" : "border-ink-300 bg-blanco text-ink-800 hover:bg-ink-100",
                )}
              >
                <input type="radio" name="choicePick" value={c.value} checked={choice === c.value} onChange={() => setChoice(c.value)} className="sr-only" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div role="tablist" aria-label="Cómo responder" className="flex gap-1 self-start rounded-full bg-ink-200 p-1">
        {(["voz", "texto"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn("tap rounded-full px-4 text-sm font-semibold", mode === m ? "bg-blanco text-ink-900 shadow-card" : "text-ink-600")}
          >
            {m === "voz" ? "Hablar" : "Escribir"}
          </button>
        ))}
      </div>

      {mode === "voz" ? <Recorder step={step} choice={choice} /> : <TextAnswer step={step} choice={choice} initial={initialText} />}

      <form action={skipStepAction} className="self-start">
        <input type="hidden" name="step" value={step.id} />
        <button type="submit" className="tap text-sm font-semibold text-ink-600 underline underline-offset-4">
          Saltar esta pregunta
        </button>
      </form>
    </div>
  );
}
