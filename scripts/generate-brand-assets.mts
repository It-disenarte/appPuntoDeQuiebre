/**
 * Genera los archivos de marca (SVG) y los íconos de la PWA (PNG) a partir de
 * los trazos oficiales en src/components/brand/paths.ts.
 *
 * Uso: npm run brand:assets
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
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
} from "../src/components/brand/paths";

const root = join(import.meta.dirname, "..");
const brandDir = join(root, "public", "brand");
const iconDir = join(root, "public", "icons");
mkdirSync(brandDir, { recursive: true });
mkdirSync(iconDir, { recursive: true });

const svg = (viewBox: string, body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="Punto de Quiebre">\n<title>Punto de Quiebre</title>\n${body}\n</svg>\n`;
const p = (d: string, fill: string) => `<path d="${d}" fill="${fill}"/>`;

const surfaces: Surface[] = ["azul", "negro", "blanco"];
const files: Record<string, string> = {};

for (const s of surfaces) {
  const c = LOGO_COLORS[s];
  files[`punto-de-quiebre_logo_sobre-${s}.svg`] = svg(
    LOGO_VIEWBOX,
    [p(LOGO_PUNTO_DE, c.puntoDe), p(LOGO_TOP, c.top), p(LOGO_BOTTOM, c.bottom), p(LOGO_CRACK, c.crack)].join("\n"),
  );
  files[`punto-de-quiebre_palabra_sobre-${s}.svg`] = svg(
    WORD_VIEWBOX,
    [p(LOGO_TOP, c.top), p(LOGO_BOTTOM, c.bottom), p(LOGO_CRACK, c.crack)].join("\n"),
  );
  const i = ISO_COLORS[s];
  files[`punto-de-quiebre_isotipo_sobre-${s}.svg`] = svg(
    ISO_VIEWBOX,
    [p(ISO_TOP, i.top), p(ISO_BOTTOM, i.bottom), p(ISO_CRACK, i.crack)].join("\n"),
  );
}
for (const [name, fill] of [["negro", BRAND.negro], ["blanco", BRAND.blanco]] as const) {
  files[`punto-de-quiebre_logo_mono-${name}.svg`] = svg(
    LOGO_MONO_VIEWBOX,
    [p(LOGO_TOP, fill), p(LOGO_BOTTOM, fill), p(LOGO_PUNTO_DE, fill)].join("\n"),
  );
  files[`punto-de-quiebre_isotipo_mono-${name}.svg`] = svg(ISO_VIEWBOX, [p(ISO_TOP, fill), p(ISO_BOTTOM, fill)].join("\n"));
}
for (const color of ["azul", "naranja"] as const) {
  const c = AVATAR_COLORS[color];
  files[`punto-de-quiebre_avatar_${color}.svg`] = svg(
    AVATAR_VIEWBOX,
    [
      `<circle cx="${AVATAR_CIRCLE.cx}" cy="${AVATAR_CIRCLE.cy}" r="${AVATAR_CIRCLE.r}" fill="${c.bg}"/>`,
      p(ISO_TOP, c.top),
      p(ISO_BOTTOM, c.bottom),
    ].join("\n"),
  );
}

for (const [name, content] of Object.entries(files)) writeFileSync(join(brandDir, name), content);

/** Ícono cuadrado: Q sobre azul. `ratio` = alto de la Q respecto al lienzo. */
function squareIcon(ratio: number) {
  const size = 1024;
  const qHeight = 975;
  const scale = (size * ratio) / qHeight;
  const c = ISO_COLORS.azul;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="${BRAND.azul}"/>
<g transform="translate(${size / 2} ${size / 2}) scale(${scale}) translate(-283 -570)">
${p(ISO_TOP, c.top)}${p(ISO_BOTTOM, c.bottom)}${p(ISO_CRACK, c.crack)}
</g></svg>`;
}

const anyIcon = Buffer.from(squareIcon(0.72));
const maskable = Buffer.from(squareIcon(0.56)); // dentro de la zona segura (80 %)

const jobs: Array<[Buffer, number, string]> = [
  [anyIcon, 192, join(iconDir, "icon-192.png")],
  [anyIcon, 512, join(iconDir, "icon-512.png")],
  [maskable, 192, join(iconDir, "maskable-192.png")],
  [maskable, 512, join(iconDir, "maskable-512.png")],
  [anyIcon, 180, join(root, "src", "app", "apple-icon.png")],
];
await Promise.all(jobs.map(([buf, px, out]) => sharp(buf, { density: 300 }).resize(px, px).png().toFile(out)));

// Favicon vectorial (Next lo sirve desde app/icon.svg)
writeFileSync(join(root, "src", "app", "icon.svg"), squareIcon(0.72));

console.log(`Generados ${Object.keys(files).length} SVG de marca y ${jobs.length} PNG.`);
