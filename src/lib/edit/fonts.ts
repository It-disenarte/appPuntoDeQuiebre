import "server-only";
import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { ALL_FONTS } from "@/lib/kit/fonts";

/**
 * Tipografías del kit en TTF para ffmpeg/libass (que no lee WOFF2). Los archivos están en assets/fonts-ttf, generados con
 * scripts/fetch-kit-ttf.mjs. Solo se usan fuentes de la lista cerrada del kit: nunca una de respaldo (regla 27 de la skill).
 */
const DIR = () => path.join(process.cwd(), "assets", "fonts-ttf");
export type FontFile = { file: string; fullName: string };

/** Lee el nombre completo de la fuente (tabla `name` del TTF): es lo que libass busca. */
export function ttfNames(buf: Buffer): { family: string; full: string } {
  const numTables = buf.readUInt16BE(4);
  let off = 0;
  let len = 0;
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    if (buf.toString("ascii", p, p + 4) === "name") {
      off = buf.readUInt32BE(p + 8);
      len = buf.readUInt32BE(p + 12);
      break;
    }
  }
  if (!off) throw new Error("La fuente no tiene tabla de nombres");
  const count = buf.readUInt16BE(off + 2);
  const strOff = off + buf.readUInt16BE(off + 4);
  const found: Record<number, string> = {};
  for (let i = 0; i < count; i++) {
    const r = off + 6 + i * 12;
    const platform = buf.readUInt16BE(r);
    const id = buf.readUInt16BE(r + 6);
    const l = buf.readUInt16BE(r + 8);
    const o = buf.readUInt16BE(r + 10);
    if ((id === 1 || id === 4 || id === 16) && (platform === 3 || platform === 0) && strOff + o + l <= off + len + 1_000_000) {
      const raw = buf.subarray(strOff + o, strOff + o + l);
      const s = Buffer.from(raw).swap16().toString("utf16le");
      if (!found[id]) found[id] = s;
    }
  }
  return { family: found[16] ?? found[1] ?? "", full: found[4] ?? found[1] ?? "" };
}

/** Elige el archivo de la familia: para títulos el más grueso (≥600), para texto el de 700 si existe, si no el más cercano. */
export async function resolveKitFont(family: string, role: "titulo" | "texto"): Promise<FontFile> {
  const canon = ALL_FONTS.find((f) => f.toLowerCase() === family.trim().toLowerCase());
  if (!canon) throw new Error(`La tipografía «${family}» no está en la lista del kit`);
  const index = JSON.parse(await readFile(path.join(DIR(), "index.json"), "utf8")) as Record<string, Record<string, string>>;
  const weights = Object.keys(index[canon] ?? {}).map(Number).sort((a, b) => a - b);
  if (weights.length === 0) throw new Error(`No hay archivo TTF de «${canon}»`);
  const w = role === "titulo" ? (weights.filter((x) => x >= 600).at(-1) ?? weights.at(-1)!) : weights.includes(700) ? 700 : weights.at(-1)!;
  const file = path.join(DIR(), index[canon]![String(w)]!);
  return { file, fullName: ttfNames(await readFile(file)).full || canon };
}

/** Copia las fuentes elegidas a la carpeta temporal que usa libass (`fontsdir`). */
export async function stageFonts(dir: string, fonts: FontFile[]): Promise<void> {
  for (const f of fonts) await copyFile(f.file, path.join(dir, path.basename(f.file)));
}
