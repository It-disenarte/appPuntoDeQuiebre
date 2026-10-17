"use client";

import { useEffect, useRef, useState } from "react";
import { H, SlideCanvas, W } from "./SlideCanvas";

type Props = Parameters<typeof SlideCanvas>[0];

/** Muestra un slide de 1080 × 1350 reducido al ancho disponible. */
export function ScaledSlide(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-lg bg-ink-100 shadow-card" style={{ aspectRatio: `${W} / ${H}` }}>
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <SlideCanvas {...props} />
      </div>
    </div>
  );
}
