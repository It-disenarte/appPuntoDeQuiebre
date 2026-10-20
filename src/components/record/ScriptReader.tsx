"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clampSpeed, estimateSeconds, SPEED_LABEL, SPEEDS } from "@/lib/recording/rules";

const CW = 360;
const CH = 640;
const FONT = '800 38px "Archivo", system-ui, sans-serif';
const LINE_H = 48;

/** Parte el texto en líneas que caben en el ancho del lienzo (respeta los saltos de párrafo). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  ctx.font = FONT;
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const w of para.split(/\s+/)) {
      const test = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function draw(ctx: CanvasRenderingContext2D, lines: string[], progress: number, count: number, running: boolean) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, CW, CH);
  const total = lines.length * LINE_H;
  const offset = progress * Math.max(0, total - LINE_H);
  const anchor = CH * 0.33;
  ctx.fillStyle = "rgba(254,104,7,0.18)";
  ctx.fillRect(0, anchor - LINE_H * 0.8, CW, LINE_H * 1.15); // la línea que se está leyendo
  ctx.font = FONT;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  lines.forEach((l, i) => {
    const y = anchor + i * LINE_H - offset;
    if (y > -LINE_H && y < CH + LINE_H) ctx.fillText(l, 24, y);
  });
  if (count > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = "#fff";
    ctx.font = "900 160px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(count), CW / 2, CH / 2 + 56);
    ctx.textAlign = "start";
  } else if (!running) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, CH - 90, CW, 90);
    ctx.fillStyle = "#fff";
    ctx.font = "800 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(progress > 0 && progress < 1 ? "Toca ▶ para continuar" : progress >= 1 ? "Fin del guion" : "Toca ▶ para empezar", CW / 2, CH - 36);
    ctx.textAlign = "start";
  }
}

/**
 * Teleprompter SIN grabar: sirve para leer el guion mientras se graba con otro aparato o con la cámara nativa. Se puede abrir en una
 * ventana flotante (Picture-in-Picture) que se queda encima de otras apps; mantiene la pantalla encendida y avanza a tu ritmo.
 */
export function ScriptReader({ text, onClose }: { text: string; onClose: () => void }) {
  const [speed, setSpeed] = useState(3);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [count, setCount] = useState(0);
  const [pip, setPip] = useState(false);
  const [note, setNote] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const countdown = useRef(0);
  const speedRef = useRef(speed);
  const runningRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const linesRef = useRef<string[]>([]);
  const pipRef = useRef(false);
  const supportsPip = typeof document !== "undefined" && Boolean(document.pictureInPictureEnabled) && typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    pipRef.current = pip;
  }, [pip]);

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) draw(ctx, linesRef.current, progress.current, Math.ceil(countdown.current), runningRef.current);
  }, []);

  // La pantalla no se apaga mientras se lee (si el navegador lo permite).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, []);

  // Reloj: cuenta regresiva y desplazamiento. Corre en un Worker para que no se detenga con la app en segundo plano.
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let shown = -1;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (countdown.current > 0) {
        countdown.current = Math.max(0, countdown.current - dt);
        const c = Math.ceil(countdown.current);
        if (c !== shown) {
          shown = c;
          setCount(c);
        }
      } else {
        const expected = Math.max(3, estimateSeconds(text) * (2.5 / SPEEDS[speedRef.current - 1]!));
        progress.current = Math.min(1, progress.current + dt / expected);
        const el = boxRef.current;
        if (el) el.scrollTop = progress.current * (el.scrollHeight - el.clientHeight);
        if (progress.current >= 1) setRunning(false);
      }
      if (pipRef.current) paint();
    };
    let worker: Worker | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      worker = new Worker("/ticker-worker.js");
      worker.onmessage = tick;
    } catch {
      timer = setInterval(tick, 40);
    }
    return () => {
      worker?.terminate();
      if (timer) clearInterval(timer);
    };
  }, [running, text, paint]);

  // Cuando se pausa o termina, se repinta una vez (para que la ventana flotante muestre el estado).
  useEffect(() => {
    if (!running && pip) paint();
  }, [running, pip, paint]);

  // La ventana flotante: play y pausa del reproductor controlan el teleprompter.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !pip) return;
    if (running && v.paused) void v.play().catch(() => undefined);
    if (!running && !v.paused) v.pause();
  }, [running, pip]);

  const begin = useCallback(() => {
    if (progress.current >= 1) progress.current = 0;
    if (progress.current <= 0) countdown.current = 3;
    setCount(Math.ceil(countdown.current));
    setStarted(true);
    setRunning(true);
  }, []);

  function restart() {
    progress.current = 0;
    countdown.current = 0;
    setCount(0);
    setStarted(false);
    setRunning(false);
    if (boxRef.current) boxRef.current.scrollTop = 0;
    paint();
  }

  const closePip = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      (v.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
      v.srcObject = null;
      v.remove();
    }
    videoRef.current = null;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
    setPip(false);
  }, []);
  useEffect(() => closePip, [closePip]);

  async function openPip() {
    setNote("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = CW;
      canvas.height = CH;
      canvasRef.current = canvas;
      const ctx = canvas.getContext("2d")!;
      linesRef.current = wrap(ctx, text || "Esta pieza no tiene guion.", CW - 48);
      paint();
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none";
      document.body.appendChild(video);
      video.srcObject = canvas.captureStream(30);
      videoRef.current = video;
      video.onplay = () => !runningRef.current && begin();
      video.onpause = () => runningRef.current && setRunning(false);
      video.addEventListener("leavepictureinpicture", () => closePip());
      await video.play();
      await video.requestPictureInPicture();
      video.pause(); // la ventana queda lista; se empieza con el ▶ de la ventana (cuando ya estés grabando)
      setPip(true);
      setNote("Listo. Abre tu cámara o grabadora, empieza a grabar y toca ▶ en la ventana flotante.");
    } catch {
      closePip();
      setNote("Tu teléfono no dejó abrir la ventana flotante. Prueba con Chrome actualizado o usa el teleprompter en pantalla completa.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-card bg-negro">
        <div ref={boxRef} className="h-[44dvh] overflow-y-auto p-4 text-2xl leading-snug font-extrabold whitespace-pre-line" tabIndex={0} aria-label="Teleprompter">
          {text || "Esta pieza no tiene guion."}
        </div>
        {running && count > 0 && <div className="absolute inset-0 grid place-items-center bg-negro/60 text-8xl font-black">{count}</div>}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <label htmlFor="rd-vel" className="text-ink-300">
          Velocidad
        </label>
        <input id="rd-vel" type="range" min={1} max={5} value={speed} onChange={(e) => setSpeed(clampSpeed(Number(e.target.value)))} className="flex-1 accent-blanco" />
        <span className="w-24 text-right font-extrabold">{SPEED_LABEL[speed - 1]}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => (restart(), closePip(), onClose())} className="tap rounded-full border border-ink-600 px-4 text-sm font-semibold">
          Cerrar
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={restart} className="tap rounded-full border border-ink-600 px-4 text-sm font-semibold">
            Reiniciar
          </button>
          <button type="button" onClick={() => (running ? setRunning(false) : begin())} className="tap rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
            {running ? "Pausar" : started ? "Continuar" : "Empezar"}
          </button>
        </div>
      </div>
      {supportsPip && !pip && (
        <button type="button" onClick={() => void openPip()} className="tap self-start rounded-full bg-naranja px-5 text-sm font-semibold text-negro">
          Abrir en ventana flotante
        </button>
      )}
      {pip && (
        <button type="button" onClick={closePip} className="tap self-start rounded-full border border-ink-600 px-5 text-sm font-semibold">
          Cerrar la ventana flotante
        </button>
      )}
      {note && (
        <p role="status" className="text-xs font-semibold text-naranja">
          {note}
        </p>
      )}
      <p className="text-xs text-ink-300">{supportsPip ? "La ventana flotante se queda encima de otras apps (como tu cámara). Con ella, el ▶ y la pausa de la ventana controlan el texto." : "Empieza a grabar en tu otro aparato, toca «Empezar» y lee. La pantalla se mantiene encendida."}</p>
    </div>
  );
}
