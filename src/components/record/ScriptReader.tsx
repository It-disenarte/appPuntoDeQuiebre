"use client";

import { useEffect, useRef, useState } from "react";
import { clampSpeed, estimateSeconds, SPEED_LABEL, SPEEDS } from "@/lib/recording/rules";

/**
 * Teleprompter SIN grabar: sirve para leer el guion mientras se graba con otro aparato (un micrófono DJI con grabadora propia,
 * la cámara nativa en otro teléfono, una grabadora aparte…). Mantiene la pantalla encendida y desplaza el texto a tu ritmo.
 */
export function ScriptReader({ text, onClose }: { text: string; onClose: () => void }) {
  const [speed, setSpeed] = useState(3);
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // La pantalla no se apaga mientras se lee (si el navegador lo permite).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, []);

  // Cuenta regresiva y luego desplazamiento continuo.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    let last = 0;
    const scroll = (now: number) => {
      const el = boxRef.current;
      if (el) {
        const dt = last ? (now - last) / 1000 : 0;
        last = now;
        const expected = Math.max(3, estimateSeconds(text) * (2.5 / SPEEDS[speedRef.current - 1]!));
        progress.current = Math.min(1, progress.current + dt / expected);
        el.scrollTop = progress.current * (el.scrollHeight - el.clientHeight);
        if (progress.current >= 1) return setRunning(false);
      }
      raf = requestAnimationFrame(scroll);
    };
    let n = 3;
    timer = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) {
        clearInterval(timer);
        timer = undefined;
        raf = requestAnimationFrame(scroll);
      }
    }, 1000);
    return () => {
      if (timer) clearInterval(timer);
      cancelAnimationFrame(raf);
    };
  }, [running, text]);

  function restart() {
    progress.current = 0;
    setStarted(false);
    setRunning(false);
    if (boxRef.current) boxRef.current.scrollTop = 0;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-card bg-negro">
        <div ref={boxRef} className="h-[52dvh] overflow-y-auto p-4 text-2xl leading-snug font-extrabold whitespace-pre-line" tabIndex={0} aria-label="Teleprompter">
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
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => (restart(), onClose())} className="tap rounded-full border border-ink-600 px-4 text-sm font-semibold">
          Cerrar
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={restart} className="tap rounded-full border border-ink-600 px-4 text-sm font-semibold">
            Reiniciar
          </button>
          <button type="button" onClick={() => (setStarted(true), setCount(3), setRunning((r) => !r))} className="tap rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
            {running ? "Pausar" : started ? "Continuar" : "Empezar"}
          </button>
        </div>
      </div>
      <p className="text-xs text-ink-300">Empieza a grabar en tu otro aparato, toca «Empezar» y lee. La pantalla se mantiene encendida.</p>
    </div>
  );
}
