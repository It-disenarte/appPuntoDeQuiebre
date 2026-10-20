"use client";

import { CircleHelp } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, cn } from "@/components/ui";
import { markTourSeenAction } from "@/lib/tour/actions";
import { tourById, tourForPath, type TourStep } from "@/lib/tour/tours";

type Active = { id: string; steps: (TourStep & { el: Element | null })[]; chain: string[] };
type Box = { top: number; left: number; width: number; height: number };

const PAD = 6;
const CARD_H = 190; // alto aproximado del globo, para decidir si va arriba o abajo

/** El elemento visible con ese data-tour (la barra de navegación existe dos veces: lateral y de abajo). */
function findTarget(name: string): Element | null {
  for (const el of document.querySelectorAll(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function resolve(id: string): Active["steps"] {
  type Resolved = Active["steps"][number];
  const tour = tourById(id);
  if (!tour) return [];
  return tour.steps.flatMap((s): Resolved[] => {
    if (!s.target) return [{ ...s, el: null }];
    const el = findTarget(s.target);
    return el ? [{ ...s, el }] : [];
  });
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
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const sectionId = tourForPath(pathname, hasPiece);

  const start = useCallback((chain: string[]) => {
    for (let k = 0; k < chain.length; k++) {
      const steps = resolve(chain[k]!);
      if (steps.length > 0) {
        setActive({ id: chain[k]!, steps, chain: chain.slice(k + 1) });
        setI(0);
        return;
      }
    }
  }, []);

  // Primera vez en una pantalla: se lanza sola (en Hoy, primero el recorrido general).
  useEffect(() => {
    if (!sectionId || active) return;
    const chain = [pathname === "/hoy" ? "inicio" : null, sectionId].filter((x): x is string => x !== null && !done.has(x));
    if (chain.length === 0) return;
    const t = setTimeout(() => start(chain), 700);
    return () => clearTimeout(t);
  }, [pathname, sectionId, active, done, start]);

  const finish = useCallback(() => {
    if (!active) return;
    const id = active.id;
    setDone((d) => new Set(d).add(id));
    void markTourSeenAction(id).catch(() => undefined);
    const rest = active.chain;
    setActive(null);
    if (rest.length > 0) setTimeout(() => start(rest), 300);
  }, [active, start]);

  const step = active?.steps[i];

  // Colocar el resalte sobre el elemento del paso (y mantenerlo al girar o cambiar el tamaño).
  useLayoutEffect(() => {
    if (!active || !step) return;
    const place = () => {
      if (!step.el || !step.el.isConnected) return setBox(null);
      const r = step.el.getBoundingClientRect();
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    if (step.el && step.el.isConnected) {
      const r = step.el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 90) step.el.scrollIntoView({ block: "center", behavior: "instant" });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [active, step]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  useEffect(() => {
    if (active) cardRef.current?.focus();
  }, [active, i]);

  const showHelp = !active && sectionId !== null && !(pathname === "/grabar" && hasPiece);

  // Posición del globo: debajo del elemento si cabe; si no, arriba; si el elemento es enorme, abajo de la pantalla.
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  let cardStyle: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (box) {
    const below = vh - (box.top + box.height);
    const above = box.top;
    const center = Math.min(Math.max(box.left + box.width / 2, 176), (typeof window === "undefined" ? 400 : window.innerWidth) - 176);
    if (below >= CARD_H + 12) cardStyle = { left: center, top: box.top + box.height + 12, transform: "translateX(-50%)" };
    else if (above >= CARD_H + 12) cardStyle = { left: center, top: box.top - 12, transform: "translate(-50%, -100%)" };
    else cardStyle = { left: "50%", bottom: 16, transform: "translateX(-50%)" };
  }

  return (
    <>
      {showHelp && (
        <button
          type="button"
          onClick={() => sectionId && start([sectionId])}
          aria-label="Ver la guía de esta sección"
          className="tap pb-safe fixed bottom-24 left-4 z-40 grid size-11 place-items-center rounded-full bg-negro text-blanco shadow-card lg:bottom-6 lg:left-auto lg:right-6"
        >
          <CircleHelp className="size-6" aria-hidden />
        </button>
      )}

      {active && step && (
        <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Guía de la app">
          {box ? (
            <div className="pointer-events-none absolute rounded-xl ring-2 ring-naranja transition-all duration-200" style={{ ...box, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.65)" }} />
          ) : (
            <div className="absolute inset-0 bg-negro/65" />
          )}
          <div
            ref={cardRef}
            tabIndex={-1}
            className={cn("absolute w-[min(22rem,calc(100vw-2rem))] rounded-card bg-blanco p-4 text-ink-900 shadow-card outline-none")}
            style={cardStyle}
          >
            <p className="text-xs font-semibold text-ink-500">
              {i + 1} de {active.steps.length}
            </p>
            <h2 className="font-display mt-1 text-2xl">{step.title}</h2>
            <p className="mt-1 text-sm text-ink-700">{step.text}</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={finish}>
                Saltar
              </Button>
              <div className="flex gap-2">
                {i > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setI(i - 1)}>
                    Atrás
                  </Button>
                )}
                <Button type="button" size="sm" onClick={() => (i + 1 < active.steps.length ? setI(i + 1) : finish())}>
                  {i + 1 < active.steps.length ? "Siguiente" : "Listo"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
