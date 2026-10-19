"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Muestra un lienzo de tamaño fijo (w × h px) reducido al ancho disponible, manteniendo su proporción. */
export function Scaled({ w, h, children, className }: { w: number; h: number; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / w);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={box} className={className ?? "relative w-full overflow-hidden"} style={{ aspectRatio: `${w} / ${h}` }}>
      <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}
