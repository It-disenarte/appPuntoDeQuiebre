// Contraste de color (WCAG). La skill pide mínimo 4.5:1 para que todo se lea en un celular y dice que lo valida la app.

export const HEX = /^#[0-9A-Fa-f]{6}$/;
export const normHex = (h: string) => h.trim().toUpperCase();

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export const MIN_CONTRAST = 4.5;
export const readable = (fg: string, bg: string, min = MIN_CONTRAST) => HEX.test(fg) && HEX.test(bg) && contrastRatio(fg, bg) >= min;

/** Texto negro o blanco, el que mejor se lea sobre el fondo dado. */
export const inkOn = (bg: string) => (contrastRatio("#FFFFFF", bg) >= contrastRatio("#09080D", bg) ? "#FFFFFF" : "#09080D");

/** Mezcla un color con otro (t de 0 a 1). Sirve para generar variantes del fondo. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${[16, 8, 0].map((sh) => c(sh).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
