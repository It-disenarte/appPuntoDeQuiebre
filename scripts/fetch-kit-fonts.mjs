// Descarga la lista curada de Google Fonts (subconjuntos latin y latin-ext) a public/fonts/kit y genera kit-fonts.css.
// Uso: node scripts/fetch-kit-fonts.mjs  (los archivos ya están en el repo; solo hace falta para cambiar la lista).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const OUT = path.join(import.meta.dirname, "..", "public", "fonts", "kit");
fs.mkdirSync(OUT, { recursive: true });
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// [familia, pesos]. Títulos primero, luego textos.
const FAMILIES = [
  ["DM Serif Display", [400]], ["Playfair Display", [700]], ["Fraunces", [700]], ["Abril Fatface", [400]], ["Bebas Neue", [400]],
  ["Anton", [400]], ["Montserrat", [700, 800]], ["Poppins", [600, 700]], ["Bricolage Grotesque", [700]], ["Archivo Black", [400]],
  ["Oswald", [600]], ["Space Grotesk", [700]], ["Syne", [700]], ["Lora", [700]], ["Merriweather", [700]],
  ["Rubik", [700]], ["Unbounded", [700]], ["Righteous", [400]], ["Pacifico", [400]], ["Caveat", [700]],
  ["Inter", [400, 700]], ["DM Sans", [400, 700]], ["Nunito", [400, 700]], ["Open Sans", [400, 700]], ["Lato", [400, 700]],
  ["Work Sans", [400, 700]], ["Source Sans 3", [400, 700]], ["Karla", [400, 700]], ["Manrope", [400, 700]], ["Outfit", [400, 700]],
  ["Mulish", [400, 700]], ["Bricolage Grotesque Text", [400]],
].filter(([f]) => f !== "Bricolage Grotesque Text");

const css = [];
const seenUrls = new Map();
const report = [];
for (const [family, weights] of FAMILIES) {
  const q = encodeURIComponent(family).replace(/%20/g, "+");
  let res = await fetch(`https://fonts.googleapis.com/css2?family=${q}:wght@${weights.join(";")}&display=swap`, { headers: { "User-Agent": UA } });
  if (!res.ok) res = await fetch(`https://fonts.googleapis.com/css2?family=${q}&display=swap`, { headers: { "User-Agent": UA } });
  if (!res.ok) { report.push(`FALLÓ ${family}: ${res.status}`); continue; }
  const text = await res.text();
  const blocks = [...text.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)];
  let kept = 0;
  for (const [, subset, body] of blocks) {
    if (subset !== "latin" && subset !== "latin-ext") continue;
    const weight = body.match(/font-weight:\s*([^;]+);/)?.[1].trim();
    const style = body.match(/font-style:\s*([^;]+);/)?.[1].trim();
    const url = body.match(/url\(([^)]+)\)/)?.[1];
    const range = body.match(/unicode-range:\s*([^;]+);/)?.[1].trim();
    if (!url || style !== "normal") continue;
    let file = seenUrls.get(url);
    if (!file) {
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      file = `${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${subset}-${crypto.createHash("sha1").update(url).digest("hex").slice(0, 6)}.woff2`;
      fs.writeFileSync(path.join(OUT, file), buf);
      seenUrls.set(url, file);
    }
    css.push(`/* ${family} · ${subset} */\n@font-face {\n  font-family: "${family}";\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url("/fonts/kit/${file}") format("woff2");\n  unicode-range: ${range};\n}`);
    kept++;
  }
  report.push(`${family}: ${kept} bloques`);
}
fs.writeFileSync(path.join(OUT, "kit-fonts.css"), `/* Generado por scripts/fetch-kit-fonts.mjs. Familias de Google Fonts (licencia OFL) alojadas en el propio servidor. */\n\n${css.join("\n\n")}\n`);
fs.writeFileSync(path.join(OUT, "families.json"), JSON.stringify(FAMILIES.map(([f]) => f)));
console.log(report.join("\n"));
console.log("archivos:", fs.readdirSync(OUT).length, "| peso total:", Math.round(fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) / 1024), "KB");
