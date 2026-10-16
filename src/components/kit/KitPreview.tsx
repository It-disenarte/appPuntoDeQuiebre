import type { CSSProperties, ReactNode } from "react";
import { inkOn } from "@/lib/kit/contrast";
import { fontStack } from "@/lib/kit/fonts";
import type { Colores, ElementId } from "@/lib/kit/schemas";

export type TitleLook = {
  mayusculas: boolean;
  caja: "ninguna" | "solida" | "translucida" | "banda";
  alineacion: "centro" | "izquierda";
  resaltado: "ninguno" | "marcador" | "palabra_grande" | "linea";
};

export type Look = {
  colores: Colores;
  titulos: string;
  texto: string;
  title: TitleLook;
  elementos: { id: ElementId; color: string }[];
};

export const DEFAULT_TITLE: TitleLook = { mayusculas: false, caja: "ninguna", alineacion: "centro", resaltado: "marcador" };

/* ───────────── Elementos gráficos (biblioteca fija) ───────────── */

export function ElementGlyph({ id, color, size = 40 }: { id: ElementId; color: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 40 40", fill: "none", stroke: color, strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (id) {
    case "onda":
      return (
        <svg {...common}>
          <path d="M3 20c4-8 7-8 11 0s7 8 11 0 7-8 11 0" />
        </svg>
      );
    case "destello":
      return (
        <svg {...common} fill={color} stroke="none">
          <path d="M20 2c1.5 9 4 12 18 18-14 6-16.500 9-18 18-1.500-9-4-12-18-18 14-6 16.500-9 18-18z" />
        </svg>
      );
    case "linea":
      return (
        <svg {...common}>
          <path d="M4 20h32" />
        </svg>
      );
    case "circulo":
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="15" />
        </svg>
      );
    case "etiqueta_serie":
      return (
        <svg {...common}>
          <rect x="3" y="11" width="34" height="18" rx="9" />
          <path d="M15 20h10" />
        </svg>
      );
    case "flecha":
      return (
        <svg {...common}>
          <path d="M5 20h28M24 10l10 10-10 10" />
        </svg>
      );
    case "subrayado":
      return (
        <svg {...common}>
          <path d="M3 24c5-6 8-6 12 0s8 6 12 0 6-4 10-2" />
        </svg>
      );
    default:
      return (
        <svg {...common} fill={color} stroke="none">
          <path d="m20 3 5 11 12 1.500-9 8 2.500 12L20 30l-10.500 5.500L12 23.500l-9-8L15 14z" />
        </svg>
      );
  }
}

/* ───────────── Título con el estilo elegido ───────────── */

function Title({ text, look, ink, accent, size }: { text: string; look: Look; ink: string; accent: string; size: number }) {
  const t = look.title;
  const words = text.trim().split(/\s+/);
  const last = words.pop() ?? "";
  const head = words.join(" ");
  const upper = t.mayusculas ? "uppercase" : "none";

  const highlighted: ReactNode =
    t.resaltado === "marcador" ? (
      <mark style={{ background: accent, color: inkOn(accent), padding: "0 0.18em", borderRadius: 4 }}>{last}</mark>
    ) : t.resaltado === "palabra_grande" ? (
      <span style={{ color: accent, fontSize: "1.45em", lineHeight: 1 }}>{last}</span>
    ) : (
      last
    );

  const boxBg = t.caja === "solida" ? look.colores.principal : t.caja === "translucida" ? "rgba(0,0,0,0.5)" : t.caja === "banda" ? look.colores.principal : "transparent";
  const color = t.caja === "solida" || t.caja === "banda" ? inkOn(look.colores.principal) : ink;
  const style: CSSProperties = {
    fontFamily: fontStack(look.titulos),
    fontSize: size,
    lineHeight: 1.08,
    fontWeight: 700,
    textTransform: upper,
    textAlign: t.alineacion === "centro" ? "center" : "left",
    color,
    background: boxBg,
    padding: t.caja === "ninguna" ? 0 : "0.35em 0.5em",
    borderRadius: t.caja === "banda" ? 0 : t.caja === "ninguna" ? 0 : 10,
    textShadow: t.caja === "ninguna" && ink === "#FFFFFF" ? "0 2px 10px rgba(0,0,0,0.55)" : "none",
    width: t.caja === "banda" ? "100%" : undefined,
  };
  return (
    <div style={style}>
      {head} {highlighted}
      {t.resaltado === "linea" && <div style={{ height: Math.max(3, size / 9), width: "38%", background: accent, marginTop: 8, marginLeft: t.alineacion === "centro" ? "auto" : 0, marginRight: t.alineacion === "centro" ? "auto" : 0, borderRadius: 3 }} />}
    </div>
  );
}

const frame: CSSProperties = { position: "relative", overflow: "hidden", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,.12)", width: "100%" };

/* ───────────── Portada de reel (9:16) ───────────── */

export function ReelCover({ look, text, photo, label }: { look: Look; text: string; photo?: string | null; label?: string }) {
  const c = look.colores;
  const overPhoto = Boolean(photo);
  const ink = overPhoto ? "#FFFFFF" : c.texto;
  return (
    <figure aria-label={label ?? "Portada de reel"} className="m-0">
      <div style={{ ...frame, aspectRatio: "9 / 16", background: overPhoto ? "#000" : c.fondo }}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} />
        ) : (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "34%", background: c.principal, clipPath: "polygon(0 22%, 100% 0, 100% 100%, 0 100%)" }} />
        )}
        {overPhoto && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.55))" }} />}
        <div style={{ position: "absolute", left: "8%", right: "8%", top: "36%", display: "flex", justifyContent: look.title.alineacion === "centro" ? "center" : "flex-start" }}>
          <Title text={text} look={look} ink={ink} accent={c.acento} size={22} />
        </div>
        <div style={{ position: "absolute", right: "8%", top: "8%", display: "flex", gap: 6 }}>
          {look.elementos.map((e) => (
            <ElementGlyph key={e.id} id={e.id} color={e.color} size={26} />
          ))}
        </div>
        <div style={{ position: "absolute", left: "8%", right: "8%", bottom: "9%", fontFamily: fontStack(look.texto), fontWeight: 700, fontSize: 11, color: overPhoto ? "#FFFFFF" : inkOn(c.principal), textAlign: look.title.alineacion === "centro" ? "center" : "left" }}>
          subtítulos de ejemplo
          <mark style={{ background: "transparent", color: c.acento }}> aquí</mark>
        </div>
      </div>
    </figure>
  );
}

/* ───────────── Portada de carrusel (4:5) ───────────── */

export type CarouselStyle = { estilo: "solida" | "foto_con_bloque"; fondo: string; tituloColor: string; bloque: string };

export function CarouselCover({ look, text, photo, style, label }: { look: Look; text: string; photo?: string | null; style: CarouselStyle; label?: string }) {
  const c = look.colores;
  const withPhoto = style.estilo === "foto_con_bloque" && photo;
  const titleLook: Look = { ...look, title: { ...look.title, caja: "ninguna" } };
  return (
    <figure aria-label={label ?? "Portada de carrusel"} className="m-0">
      <div style={{ ...frame, aspectRatio: "4 / 5", background: style.fondo }}>
        {withPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo!} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {withPhoto ? (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "7% 8%", background: style.bloque }}>
            <Title text={text} look={titleLook} ink={style.tituloColor === "#FFFFFF" || style.tituloColor === inkOn(style.bloque) ? style.tituloColor : inkOn(style.bloque)} accent={c.acento} size={17} />
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "10%" }}>
            <Title text={text} look={titleLook} ink={style.tituloColor} accent={c.acento} size={24} />
          </div>
        )}
        <div style={{ position: "absolute", right: "7%", top: "6%", display: "flex", gap: 6 }}>
          {look.elementos.map((e) => (
            <ElementGlyph key={e.id} id={e.id} color={e.color} size={24} />
          ))}
        </div>
        <div style={{ position: "absolute", left: "8%", top: "6%", width: 28, height: 6, borderRadius: 3, background: c.acento }} />
      </div>
    </figure>
  );
}

/* ───────────── Muestras pequeñas ───────────── */

export function Swatches({ colores }: { colores: Colores }) {
  return (
    <div className="flex gap-1.5" aria-label="Colores">
      {(["principal", "acento", "fondo", "texto"] as const).map((k) => (
        <span key={k} title={`${k} ${colores[k]}`} className="size-7 rounded-md ring-1 ring-ink-300" style={{ background: colores[k] }} />
      ))}
    </div>
  );
}
