import { ArrowRight, Bookmark, ChartColumn, Footprints, Lightbulb, Microwave, Rocket, Sparkles, Star, Target, TriangleAlert, UserPlus, Heart, MessageCircle, Send, Clock, Flame, BookOpen, Brain, Camera, Coffee, Compass, Gift, Globe, Key, Lock, Music, Palette, Pencil, Puzzle, Shield, ThumbsUp, Zap, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { ElementGlyph } from "@/components/kit/KitPreview";
import { inkOn, mix } from "@/lib/kit/contrast";
import { fontStack } from "@/lib/kit/fonts";
import type { ElementId } from "@/lib/kit/schemas";
import type { Slide } from "@/lib/carousel/schemas";

/** Lienzo de un slide a 1080 × 1350 (4:5). Se usa igual en la vista previa (escalado) y al exportar a PNG. */
export const W = 1080;
export const H = 1350;

export type CanvasKit = {
  principal: string;
  acento: string;
  fondo: string;
  texto: string;
  titulos: string;
  fuenteTexto: string;
  fondoPortada: string;
  tituloPortada: string;
  bloqueFoto: string;
  elementos: { id: ElementId; color: string }[];
};
export type CanvasBg = { tipo: "solido" | "gradiente"; colores: string[] };
export const DEFAULT_KIT: CanvasKit = { principal: "#191BDF", acento: "#FE6807", fondo: "#FFFFFF", texto: "#09080D", titulos: "Poppins", fuenteTexto: "Nunito", fondoPortada: "#191BDF", tituloPortada: "#FFFFFF", bloqueFoto: "#FFFFFF", elementos: [] };

/** Los nombres de íconos de la skill son de Tabler; aquí se resuelven a íconos de la app (lucide). Lo que no se conoce usa un destello. */
const ICONS: Record<string, LucideIcon> = {
  bulb: Lightbulb, target: Target, "alert-triangle": TriangleAlert, stairs: Footprints, "chart-bar": ChartColumn, star: Star, "user-plus": UserPlus, bookmark: Bookmark, microwave: Microwave, rocket: Rocket,
  heart: Heart, message: MessageCircle, "message-circle": MessageCircle, send: Send, clock: Clock, flame: Flame, book: BookOpen, brain: Brain, camera: Camera, coffee: Coffee, compass: Compass, gift: Gift, world: Globe, key: Key, lock: Lock, music: Music, palette: Palette, pencil: Pencil, puzzle: Puzzle, shield: Shield, "thumb-up": ThumbsUp, bolt: Zap,
};
const ICON_KEYS = new Set(Object.keys(ICONS));

/** Ícono por nombre (los de la skill son de Tabler; aquí se resuelven a lucide y lo desconocido usa un destello). */
export function NamedIcon({ name, size, color, strokeWidth = 1.8 }: { name: string | null; size: number; color?: string; strokeWidth?: number }) {
  const key = (name ?? "").toLowerCase();
  const I: LucideIcon = ICON_KEYS.has(key) ? ICONS[key]! : Sparkles;
  return <I size={size} color={color} strokeWidth={strokeWidth} />;
}

function Highlighted({ text, word, kit, color }: { text: string; word: string | null; kit: CanvasKit; color: string }): ReactNode {
  const i = word ? text.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (!word || i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span style={{ background: kit.acento, color: inkOn(kit.acento), padding: "0 0.14em", borderRadius: 10, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{text.slice(i, i + word.length)}</span>
      {text.slice(i + word.length)}
      <span style={{ color }} />
    </>
  );
}

const titleSize = (t: string, base: number) => (t.length > 60 ? base * 0.72 : t.length > 42 ? base * 0.82 : t.length > 26 ? base * 0.92 : base);

export function SlideCanvas({ slide, kit, bg, imageUrl, focal, total, handle }: { slide: Slide; kit: CanvasKit; bg: CanvasBg; imageUrl?: string | null; focal?: { x: number; y: number }; total: number; handle?: string }) {
  const T = slide.plantilla;
  const hasImg = Boolean(imageUrl);
  const fx = focal?.x ?? 50;
  const fy = focal?.y ?? 50;
  const textBg = bg.tipo === "gradiente" && bg.colores[1] ? `linear-gradient(160deg, ${bg.colores[0]}, ${bg.colores[1]})` : (bg.colores[0] ?? kit.fondo);
  const textBgBase = bg.colores[0] ?? kit.fondo;
  const ink = inkOn(textBgBase);
  const root: CSSProperties = { width: W, height: H, position: "relative", overflow: "hidden", fontFamily: fontStack(kit.fuenteTexto), color: ink, background: textBg, display: "flex", flexDirection: "column" };
  const h1: CSSProperties = { fontFamily: fontStack(kit.titulos), fontWeight: 700, lineHeight: 1.06, letterSpacing: "-0.01em", margin: 0 };
  const photo = hasImg ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageUrl!} alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: `${fx}% ${fy}%` }} />
  ) : null;
  const footer = (color: string) => (
    <div style={{ position: "absolute", left: 80, right: 80, bottom: 120 + 0, display: "flex", justifyContent: "space-between", fontSize: 26, color, opacity: 0.8, pointerEvents: "none" }}>
      <span>{handle ?? ""}</span>
      <span>
        {slide.n}/{total}
      </span>
    </div>
  );
  const deco = kit.elementos[0];
  const decoNode = deco ? (
    <div style={{ position: "absolute", right: 70, top: 70, opacity: 0.9 }}>
      <ElementGlyph id={deco.id} color={deco.color} size={90} />
    </div>
  ) : null;

  /* ───── Portadas ───── */
  if (T === "portada_impacto" || T === "portada_foto") {
    const light = T === "portada_foto";
    const base = light ? kit.bloqueFoto : kit.fondoPortada;
    return (
      <div style={{ ...root, background: kit.fondoPortada }}>
        {photo}
        {hasImg && !light && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${kit.fondoPortada} 0%, ${kit.fondoPortada}E6 30%, ${kit.fondoPortada}00 65%)` }} />}
        <div style={{ position: "relative", padding: "90px 80px 0", display: "flex", flexDirection: "column", gap: 34, ...(light ? { marginTop: "auto", background: base, padding: "70px 80px 150px", borderRadius: "48px 48px 0 0" } : {}) }}>
          {slide.etiqueta && (
            <span style={{ alignSelf: "flex-start", background: kit.acento, color: inkOn(kit.acento), borderRadius: 999, padding: "10px 30px", fontSize: 34, fontWeight: 700 }}>{slide.etiqueta}</span>
          )}
          <h1 style={{ ...h1, fontSize: titleSize(slide.titulo, 118), color: light ? inkOn(base) : kit.tituloPortada }}>
            <Highlighted text={slide.titulo} word={slide.resaltar} kit={kit} color={kit.tituloPortada} />
          </h1>
          {slide.cuerpo && <p style={{ margin: 0, fontSize: 40, lineHeight: 1.3, color: light ? inkOn(base) : kit.tituloPortada, opacity: 0.92 }}>{slide.cuerpo}</p>}
        </div>
        {!light && (
          <div style={{ position: "absolute", left: 80, bottom: 150, display: "flex", alignItems: "center", gap: 14, color: kit.tituloPortada, fontSize: 38, fontWeight: 700 }}>
            Desliza <ArrowRight size={42} />
          </div>
        )}
        {decoNode}
      </div>
    );
  }
  if (T === "portada_texto") {
    return (
      <div style={{ ...root, background: kit.fondoPortada, justifyContent: "center", padding: "0 80px" }}>
        {slide.etiqueta && <span style={{ alignSelf: "flex-start", background: kit.acento, color: inkOn(kit.acento), borderRadius: 999, padding: "10px 30px", fontSize: 34, fontWeight: 700, marginBottom: 40 }}>{slide.etiqueta}</span>}
        <h1 style={{ ...h1, fontSize: titleSize(slide.titulo, 130), color: kit.tituloPortada }}>
          <Highlighted text={slide.titulo} word={slide.resaltar} kit={kit} color={kit.tituloPortada} />
        </h1>
        {slide.cuerpo && <p style={{ fontSize: 42, lineHeight: 1.3, color: kit.tituloPortada, opacity: 0.92, marginTop: 40 }}>{slide.cuerpo}</p>}
        <div style={{ position: "absolute", left: 80, bottom: 150, display: "flex", alignItems: "center", gap: 14, color: kit.tituloPortada, fontSize: 38, fontWeight: 700 }}>
          Desliza <ArrowRight size={42} />
        </div>
        {decoNode}
      </div>
    );
  }

  /* ───── Con foto ───── */
  if (T === "foto_completa" || T === "foto_texto_libre") {
    return (
      <div style={{ ...root, background: "#111" }}>
        {photo}
        <div style={{ position: "absolute", inset: 0, background: T === "foto_texto_libre" ? "linear-gradient(180deg, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.65) 100%)" : "linear-gradient(180deg, rgba(0,0,0,0) 70%, rgba(0,0,0,0.45) 100%)" }} />
        <div style={{ position: "absolute", left: 80, right: 80, bottom: 190, color: "#fff", textShadow: "0 3px 18px rgba(0,0,0,0.55)" }}>
          <h2 style={{ ...h1, fontSize: titleSize(slide.titulo, T === "foto_completa" ? 70 : 92), color: "#fff" }}>
            <Highlighted text={slide.titulo} word={slide.resaltar} kit={kit} color="#fff" />
          </h2>
          {slide.cuerpo && T === "foto_texto_libre" && <p style={{ fontSize: 40, lineHeight: 1.3, margin: "28px 0 0" }}>{slide.cuerpo}</p>}
        </div>
        {footer("#fff")}
      </div>
    );
  }
  if (T === "texto_foto") {
    const block = kit.bloqueFoto;
    return (
      <div style={{ ...root, background: textBgBase }}>
        <div style={{ position: "relative", height: "52%", background: "#222" }}>{photo}</div>
        <div style={{ flex: 1, background: block, color: inkOn(block), padding: "56px 80px 150px", display: "flex", flexDirection: "column", gap: 24, borderTop: `10px solid ${kit.principal}` }}>
          <h2 style={{ ...h1, fontSize: titleSize(slide.titulo, 78) }}>
            <Highlighted text={slide.titulo} word={slide.resaltar} kit={kit} color={inkOn(block)} />
          </h2>
          {slide.cuerpo && <p style={{ margin: 0, fontSize: 38, lineHeight: 1.32 }}>{slide.cuerpo}</p>}
        </div>
        {footer(inkOn(block))}
      </div>
    );
  }

  /* ───── Solo texto ───── */
  const iconKey = (slide.icono ?? "").toLowerCase();
  const Icon: LucideIcon = ICON_KEYS.has(iconKey) ? ICONS[iconKey]! : Sparkles;
  const soft = mix(textBgBase, kit.principal, 0.1);
  if (T === "frase") {
    return (
      <div style={{ ...root, justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 90px" }}>
        {photo}
        {hasImg && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />}
        <h2 style={{ ...h1, position: "relative", fontSize: titleSize(slide.titulo, 124), color: hasImg ? "#fff" : ink }}>
          <Highlighted text={slide.titulo} word={slide.resaltar} kit={kit} color={ink} />
        </h2>
        {slide.cuerpo && <p style={{ position: "relative", fontSize: 40, marginTop: 40, color: hasImg ? "#fff" : ink }}>{slide.cuerpo}</p>}
        {footer(hasImg ? "#fff" : ink)}
      </div>
    );
  }
  if (T === "numero") {
    return (
      <div style={{ ...root, justifyContent: "center", padding: "0 80px" }}>
        <div style={{ fontFamily: fontStack(kit.titulos), fontWeight: 800, fontSize: 420, lineHeight: 0.95, color: kit.principal }}>{slide.dato ?? slide.n}</div>
        <h2 style={{ ...h1, fontSize: titleSize(slide.titulo, 80), marginTop: 20 }}>
          <Highlighted text={slide.titulo} word={slide.resaltar} kit={kit} color={ink} />
        </h2>
        {slide.cuerpo && <p style={{ fontSize: 40, lineHeight: 1.3, marginTop: 28 }}>{slide.cuerpo}</p>}
        {footer(ink)}
      </div>
    );
  }
  if (T === "cita") {
    return (
      <div style={{ ...root, justifyContent: "center", padding: "0 90px" }}>
        <div style={{ fontFamily: fontStack(kit.titulos), fontSize: 300, lineHeight: 0.6, color: kit.acento }}>“</div>
        <h2 style={{ ...h1, fontSize: titleSize(slide.titulo, 84), fontWeight: 600, marginTop: 10 }}>
          <Highlighted text={slide.titulo} word={slide.resaltar} kit={kit} color={ink} />
        </h2>
        {slide.cuerpo && <p style={{ fontSize: 38, marginTop: 36, opacity: 0.85 }}>— {slide.cuerpo}</p>}
        {footer(ink)}
      </div>
    );
  }
  if (T === "lista") {
    const lines = (slide.cuerpo ?? "").split(/\n|·|;|•/).map((l) => l.trim()).filter(Boolean).slice(0, 5);
    return (
      <div style={{ ...root, justifyContent: "center", padding: "0 80px", gap: 36 }}>
        <h2 style={{ ...h1, fontSize: titleSize(slide.titulo, 86) }}>
          <Highlighted text={slide.titulo} word={slide.resaltar} kit={kit} color={ink} />
        </h2>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 26 }}>
          {lines.map((l, i) => (
            <li key={i} style={{ display: "flex", gap: 24, alignItems: "flex-start", fontSize: 42, lineHeight: 1.25 }}>
              <span style={{ flex: "none", width: 64, height: 64, borderRadius: 32, background: kit.principal, color: inkOn(kit.principal), display: "grid", placeItems: "center", fontWeight: 800, fontSize: 34 }}>{i + 1}</span>
              {l}
            </li>
          ))}
        </ul>
        {footer(ink)}
      </div>
    );
  }
  if (T === "cta") {
    return (
      <div style={{ ...root, justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 90px", gap: 40, background: kit.fondoPortada, color: kit.tituloPortada }}>
        <span style={{ width: 190, height: 190, borderRadius: 95, background: kit.acento, color: inkOn(kit.acento), display: "grid", placeItems: "center" }}>
          <Icon size={96} strokeWidth={1.8} />
        </span>
        <h2 style={{ ...h1, fontSize: titleSize(slide.titulo, 110), color: kit.tituloPortada }}>
          <Highlighted text={slide.titulo} word={slide.resaltar} kit={kit} color={kit.tituloPortada} />
        </h2>
        {slide.cuerpo && <p style={{ fontSize: 42, lineHeight: 1.3, opacity: 0.92 }}>{slide.cuerpo}</p>}
        {footer(kit.tituloPortada)}
      </div>
    );
  }
  // "texto" (por defecto): ícono en círculo, número del punto gigante de fondo, título y cuerpo.
  return (
    <div style={{ ...root, justifyContent: "center", padding: "0 80px", gap: 34 }}>
      <div style={{ position: "absolute", right: 40, top: 40, fontFamily: fontStack(kit.titulos), fontWeight: 800, fontSize: 520, lineHeight: 1, color: soft }}>{slide.dato && slide.dato.length <= 3 ? slide.dato : slide.n - 1 || ""}</div>
      <span style={{ position: "relative", width: 150, height: 150, borderRadius: 75, background: kit.acento, color: inkOn(kit.acento), display: "grid", placeItems: "center" }}>
        <Icon size={78} strokeWidth={1.8} />
      </span>
      <h2 style={{ ...h1, position: "relative", fontSize: titleSize(slide.titulo, 92) }}>
        <Highlighted text={slide.titulo} word={slide.resaltar} kit={kit} color={ink} />
      </h2>
      {slide.cuerpo && <p style={{ position: "relative", margin: 0, fontSize: 42, lineHeight: 1.32 }}>{slide.cuerpo}</p>}
      {footer(ink)}
    </div>
  );
}
