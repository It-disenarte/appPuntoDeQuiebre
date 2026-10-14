import {
  AVATAR_CIRCLE,
  AVATAR_COLORS,
  AVATAR_VIEWBOX,
  BRAND,
  ISO_BOTTOM,
  ISO_COLORS,
  ISO_CRACK,
  ISO_TOP,
  ISO_VIEWBOX,
  LOGO_BOTTOM,
  LOGO_COLORS,
  LOGO_CRACK,
  LOGO_MONO_VIEWBOX,
  LOGO_PUNTO_DE,
  LOGO_TOP,
  LOGO_VIEWBOX,
  WORD_VIEWBOX,
  type Surface,
} from "./paths";

type BaseProps = { className?: string; title?: string };

/** Logotipo completo. `surface` indica el fondo sobre el que se coloca (manual §04). */
export function Logo({
  surface = "azul",
  mono,
  className,
  title = "Punto de Quiebre",
}: BaseProps & { surface?: Surface; mono?: "negro" | "blanco" }) {
  if (mono) {
    const fill = mono === "negro" ? BRAND.negro : BRAND.blanco;
    return (
      <svg viewBox={LOGO_MONO_VIEWBOX} className={className} role="img" aria-label={title}>
        <g fill={fill}>
          <path d={LOGO_TOP} />
          <path d={LOGO_BOTTOM} />
          <path d={LOGO_PUNTO_DE} />
        </g>
      </svg>
    );
  }
  const c = LOGO_COLORS[surface];
  return (
    <svg viewBox={LOGO_VIEWBOX} className={className} role="img" aria-label={title}>
      <path d={LOGO_PUNTO_DE} fill={c.puntoDe} />
      <path d={LOGO_TOP} fill={c.top} />
      <path d={LOGO_BOTTOM} fill={c.bottom} />
      <path d={LOGO_CRACK} fill={c.crack} />
    </svg>
  );
}

/** Solo la palabra QUIEBRE, para espacios anchos y bajos. */
export function LogoWord({ surface = "azul", className, title = "Punto de Quiebre" }: BaseProps & { surface?: Surface }) {
  const c = LOGO_COLORS[surface];
  return (
    <svg viewBox={WORD_VIEWBOX} className={className} role="img" aria-label={title}>
      <path d={LOGO_TOP} fill={c.top} />
      <path d={LOGO_BOTTOM} fill={c.bottom} />
      <path d={LOGO_CRACK} fill={c.crack} />
    </svg>
  );
}

/** Isotipo: la Q cortada (manual §05). */
export function Isotipo({
  surface = "blanco",
  mono,
  className,
  title = "Punto de Quiebre",
}: BaseProps & { surface?: Surface; mono?: "negro" | "blanco" | "current" }) {
  if (mono) {
    const fill = mono === "current" ? "currentColor" : mono === "negro" ? BRAND.negro : BRAND.blanco;
    return (
      <svg viewBox={ISO_VIEWBOX} className={className} role="img" aria-label={title}>
        <g fill={fill}>
          <path d={ISO_TOP} />
          <path d={ISO_BOTTOM} />
        </g>
      </svg>
    );
  }
  const c = ISO_COLORS[surface];
  return (
    <svg viewBox={ISO_VIEWBOX} className={className} role="img" aria-label={title}>
      <path d={ISO_TOP} fill={c.top} />
      <path d={ISO_BOTTOM} fill={c.bottom} />
      <path d={ISO_CRACK} fill={c.crack} />
    </svg>
  );
}

/** Avatar circular de redes. */
export function BrandAvatar({ color = "azul", className, title = "Punto de Quiebre" }: BaseProps & { color?: "azul" | "naranja" }) {
  const c = AVATAR_COLORS[color];
  return (
    <svg viewBox={AVATAR_VIEWBOX} className={className} role="img" aria-label={title}>
      <circle {...AVATAR_CIRCLE} fill={c.bg} />
      <path d={ISO_TOP} fill={c.top} />
      <path d={ISO_BOTTOM} fill={c.bottom} />
    </svg>
  );
}
