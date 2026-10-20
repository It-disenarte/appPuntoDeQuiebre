// Descarga los TTF de las familias del kit (los mismos pesos que public/fonts/kit) a assets/fonts-ttf.
// Los necesita ffmpeg/libass para quemar subtítulos y títulos en la edición de video (libass no lee WOFF2).
// Uso: node scripts/fetch-kit-ttf.mjs  (los archivos ya están en el repo; solo hace falta para cambiar la lista).
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "..", "assets", "fonts-ttf");
fs.mkdirSync(OUT, { recursive: true });
// Un navegador sin WOFF2 hace que Google devuelva TTF.
const UA = "Mozilla/5.0 (Linux; U; Android 4.0.3; es-mx; KFTT Build/IML74K) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Safari/534.30";
const FAMILIES = [
  ["DM Serif Display", [400]], ["Playfair Display", [700]], ["Fraunces", [700]], ["Abril Fatface", [400]], ["Bebas Neue", [400]],
  ["Anton", [400]], ["Montserrat", [700, 800]], ["Poppins", [600, 700]], ["Bricolage Grotesque", [700]], ["Archivo Black", [400]],
  ["Oswald", [600]], ["Space Grotesk", [700]], ["Syne", [700]], ["Lora", [700]], ["Merriweather", [700]],
  ["Rubik", [700]], ["Unbounded", [700]], ["Righteous", [400]], ["Pacifico", [400]], ["Caveat", [700]],
  ["Inter", [400, 700]], ["DM Sans", [400, 700]], ["Nunito", [400, 700]], ["Open Sans", [400, 700]], ["Lato", [400, 700]],
  ["Work Sans", [400, 700]], ["Source Sans 3", [400, 700]], ["Karla", [400, 700]], ["Manrope", [400, 700]], ["Outfit", [400, 700]],
  ["Mulish", [400, 700]],
];
const index = {};
for (const [family, weights] of FAMILIES) {
  for (const w of weights) {
    const q = encodeURIComponent(family).replace(/%20/g, "+");
    const res = await fetch(`https://fonts.googleapis.com/css?family=${q}:${w}`, { headers: { "User-Agent": UA } });
    const css = await res.text();
    const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
    if (!res.ok || !url) { console.log("FALLÓ", family, w, res.status); continue; }
    const file = `${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${w}.ttf`;
    fs.writeFileSync(path.join(OUT, file), Buffer.from(await (await fetch(url)).arrayBuffer()));
    (index[family] ??= {})[w] = file;
    console.log("ok", family, w);
  }
}
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
console.log("archivos:", fs.readdirSync(OUT).length, "| MB:", (fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) / 1048576).toFixed(1));
