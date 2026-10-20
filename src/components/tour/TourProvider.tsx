"use client";

import { CircleHelp } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { markTourSeenAction } from "@/lib/tour/actions";
import { tourById, tourForPath, type TourStep } from "@/lib/tour/tours";

type Active = { id: string; steps: TourStep[] };
type Box = { top: number; left: number; width: number; height: number };

const PAD = 6;
const CARD_H = 190; // alto aproximado del globo, para decidir si va arriba o abajo
const WAIT_MS = 6000; // cuánto se espera a que aparezca el elemento de un paso (p. ej. al cambiar de pantalla)

/** El elemento visible con ese data-tour (la barra de navegación existe dos veces: lateral y de abajo). */
function findTarget(name: string): Element | null {
  for (const el of document.querySelectorAll(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Pasos de una guía: se conservan los de otra pantalla (se esperan) y los de esta cuyo elemento existe. */
function initialSteps(id: string, pathname: string): TourStep[] {
  const tour = tourById(id);
  if (!tour) return [];
  return tour.steps.filter((s) => !s.target || (s.path && s.path !== pathname) || findTarget(s.target));
}

export function TourProvider({ seen }: { seen: string[] }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const hasPiece = Boolean(search.get("pieza"));
  const [done, setDone] = useState<Set<string>>(() => new Set(seen));
  const [prevSeen, setPrevSeen] = useState(seen);
  if (prevSeen !== seen) {
    // El servidor mandó otra lista (p. ej. tras reiniciar las guías).
    setPrevSeen(seen);
    setDone(new Set(seen));
  }
  const [active, setActive] = useState<Active | null>(null);
  const [i, setI] = useState(0);
  /** Elemento ya encontrado para el paso `key` (id:índice). Mientras no coincida con el paso actual, no se muestra nada. */
  const [found, setFound] = useState<{ key: string; el: Element | null } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const sectionId = tourForPath(pathname, hasPiece);
  const step = active?.steps[i];
  const key = active ? `${active.id}:${i}` : "";
  const el = found?.key === key ? found.el : undefined; // undefined = aún no está listo
  const ready = el !== undefined;

  const start = useCallback(
    (id: string) => {
      const steps = initialSteps(id, pathname);
      if (steps.length === 0) return;
      setActive({ id, steps });
      setI(0);
      setFound(null);
    },
    [pathname],
  );

  // Primera vez en una pantalla: se lanza sola (en Hoy, primero el recorrido por las pestañas).
  useEffect(() => {
    if (!sectionId || active) return;
    const id = pathname === "/hoy" && !done.has("inicio") ? "inicio" : !done.has(sectionId) ? sectionId : null;
    if (!id) return;
    const t = setTimeout(() => start(id), 700);
    return () => clearTimeout(t);
  }, [pathname, sectionId, active, done, start]);

  const finish = useCallback(() => {
    if (!active) return;
    const id = active.id;
    setDone((d) => new Set(d).add(id));
    void markTourSeenAction(id).catch(() => undefined);
    setActive(null);
  }, [active]);

  const next = useCallback(() => {
    if (!active) return;
    if (i + 1 < active.steps.length) setI(i + 1);
    else finish();
  }, [active, i, finish]);

  // Esperar a que el elemento del paso esté en pantalla (y en la pantalla correcta).
  useEffect(() => {
    if (!active || !step) return;
    const k = `${active.id}:${i}`;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const here = !step.path || step.path === pathname;
      if (!step.target) return setFound({ key: k, el: null });
      const target = here ? findTarget(step.target) : null;
      if (target) return setFound({ key: k, el: target });
      if (Date.now() - started > WAIT_MS) {
        // Sin pantalla correcta se cancela la guía; si solo falta el elemento, se salta el paso.
        if (step.path && step.path !== pathname) return setActive(null);
        return i + 1 < active.steps.length ? setI(i + 1) : finish();
      }
      timer = setTimeout(tick, 150);
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [active, step, i, pathname, finish]);

  // Colocar el resalte sobre el elemento del paso (y mantenerlo al girar, desplazar o cambiar el tamaño).
  useLayoutEffect(() => {
    if (!ready) return;
    const place = () => {
      if (!el || !el.isConnected) return setBox(null);
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    if (el && el.isConnected) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 90) el.scrollIntoView({ block: "center", behavior: "instant" });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [ready, el]);

  // Paso de “toca aquí”: el toque va al elemento real y la guía avanza (el enlace navega con normalidad).
  useEffect(() => {
    if (!step?.click || !el) return;
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Node && el.contains(e.target)) next();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step, el, next]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  useEffect(() => {
    if (ready && !step?.click) cardRef.current?.focus();
  }, [ready, step, i]);

  const showHelp = !active && sectionId !== null && !(pathname === "/grabar" && hasPiece);
  const prev = i > 0 ? active?.steps[i - 1] : undefined;
  const canGoBack = i > 0 && !prev?.click && !step?.path;

  // Posición del globo: debajo del elemento si cabe; si no, arriba; si el elemento es enorme, abajo de la pantalla.
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const vw = typeof window === "undefined" ? 400 : window.innerWidth;
  let cardStyle: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (box) {
    const below = vh - (box.top + box.height);
    const above = box.top;
    const center = Math.min(Math.max(box.left + box.width / 2, 176), vw - 176);
    if (below >= CARD_H + 12) cardStyle = { left: center, top: box.top + box.height + 12, transform: "translateX(-50%)" };
    else if (above >= CARD_H + 12) cardStyle = { left: center, top: box.top - 12, transform: "translate(-50%, -100%)" };
    else cardStyle = { left: "50%", bottom: 16, transform: "translateX(-50%)" };
  }

  const shade = "pointer-events-auto absolute bg-negro/65";
  const clickThrough = Boolean(step?.click && box);

  return (
    <>
      {showHelp && (
        <button
          type="button"
          onClick={() => sectionId && start(sectionId)}
          aria-label="Ver la guía de esta sección"
          className="tap pb-safe fixed bottom-24 left-4 z-40 grid size-11 place-items-center rounded-full bg-negro text-blanco shadow-card lg:bottom-6 lg:left-auto lg:right-6"
        >
          <CircleHelp className="size-6" aria-hidden />
        </button>
      )}

      {active && step && ready && (
        <div className={`fixed inset-0 z-[100] ${clickThrough ? "pointer-events-none" : ""}`} role="dialog" aria-modal={!clickThrough} aria-label="Guía de la app">
          {clickThrough && box ? (
            <>
              {/* Cuatro paneles dejan un hueco por donde sí pasa el toque. */}
              <div className={shade} style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top) }} />
              <div className={shade} style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }} />
              <div className={shade} style={{ top: box.top, height: box.height, left: 0, width: Math.max(0, box.left) }} />
              <div className={shade} style={{ top: box.top, height: box.height, left: box.left + box.width, right: 0 }} />
              <div className="pointer-events-none absolute animate-pulse rounded-xl ring-4 ring-naranja" style={box} />
            </>
          ) : box ? (
            <div className="pointer-events-none absolute rounded-xl ring-2 ring-naranja transition-all duration-200" style={{ ...box, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.65)" }} />
          ) : (
            <div className="absolute inset-0 bg-negro/65" />
          )}
          <div ref={cardRef} tabIndex={-1} className="pointer-events-auto absolute w-[min(22rem,calc(100vw-2rem))] rounded-card bg-blanco p-4 text-ink-900 shadow-card outline-none" style={cardStyle}>
            <p className="text-xs font-semibold text-ink-500">
              {i + 1} de {active.steps.length}
            </p>
            <h2 className="font-display mt-1 text-2xl">{step.title}</h2>
            <p className="mt-1 text-sm text-ink-700">{step.text}</p>
            {step.click && <p className="mt-2 text-sm font-bold text-azul">👆 Tócalo para continuar</p>}
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={finish}>
                Saltar
              </Button>
              <div className="flex gap-2">
                {canGoBack && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setI(i - 1)}>
                    Atrás
                  </Button>
                )}
                {!step.click && (
                  <Button type="button" size="sm" onClick={next}>
                    {i + 1 < active.steps.length ? "Siguiente" : "Listo"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
