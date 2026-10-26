import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { clipArgs, CLIP_H, CLIP_W, entryTimes, FPS, groupLayers, isPng, isZip, LAYER_CSS, LAYERS, slideSeconds, slideTexts } from "@/lib/carousel/animate";

describe("carrusel animado (puro)", () => {
  it("cada clip dura lo que tarda en leerse, entre 4 y 6 segundos", () => {
    expect(slideSeconds(["Hola"])).toBe(4);
    expect(slideSeconds([Array(200).fill("palabra").join(" ")])).toBe(6);
    expect(slideSeconds([Array(12).fill("palabra").join(" ")])).toBeCloseTo(5.5);
    expect(slideTexts({ titulo: "A", cuerpo: null, dato: " ", etiqueta: "B" })).toEqual(["A", "B"]);
  });

  it("las piezas entran una tras otra: ícono, título, texto y al final los extras", () => {
    const t = entryTimes({ icono: true, titulo: true, cuerpo: true, extra: true });
    expect(t.icono!).toBeLessThan(t.titulo!);
    expect(t.titulo!).toBeLessThan(t.cuerpo!);
    expect(t.cuerpo!).toBeLessThan(t.extra!);
    // Sin ícono, el título entra primero.
    expect(entryTimes({ titulo: true }).titulo!).toBeLessThan(t.titulo!);
    expect(entryTimes({})).toEqual({});
  });

  it("arma el filtro con el fondo que respira y una capa más por cada pieza, sin audio", () => {
    const args = clipArgs({ layers: { fondo: "f.png", icono: "i.png", titulo: "t.png", cuerpo: "c.png" }, seconds: 5, output: "out.mp4" });
    expect(args.filter((x) => x === "-i")).toHaveLength(4);
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain("sin(PI*t/5)");
    expect(graph.match(/overlay=/g)).toHaveLength(3);
    expect(graph.match(/fade=t=in/g)).toHaveLength(3);
    expect(graph).toContain("exp(-5*"); // el ícono rebota
    expect(graph).toContain("[v]");
    expect(args).toContain("-an");
    expect(args.at(-1)).toBe("out.mp4");
    expect(args.slice(0, 12).join(" ")).toContain(`-framerate ${FPS}`);
  });

  it("solo con fondo es un clip válido y sin él no se puede", () => {
    const args = clipArgs({ layers: { fondo: "f.png" }, seconds: 4, output: "o.mp4" });
    expect(args[args.indexOf("-filter_complex") + 1]).not.toContain("overlay=");
    expect(() => clipArgs({ layers: { titulo: "t.png" }, seconds: 4, output: "o.mp4" })).toThrow(/fondo/);
    expect(() => clipArgs({ layers: { fondo: "f.png" }, seconds: 40, output: "o.mp4" })).toThrow(/duración/);
  });

  it("agrupa los archivos del ZIP por slide e ignora los que no tienen el nombre esperado", () => {
    const g = groupLayers({ "01_fondo.png": 1, "01_titulo.png": 2, "02_fondo.png": 3, "02_otra.png": 4, "x/03_fondo.png": 5, "readme.txt": 6 });
    expect([...g.keys()]).toEqual([1, 2]);
    expect(g.get(1)).toEqual({ fondo: 1, titulo: 2 });
    expect(g.get(2)).toEqual({ fondo: 3 });
  });

  it("los estilos que separan las capas ocultan todo menos la pieza, sin tocar la capa de fondo", () => {
    // Si "ocultar todo" también aplicara al fondo, el fondo saldría vacío (ya pasó una vez).
    expect(LAYER_CSS).toContain('.cap-pass[data-pass]:not([data-pass="fondo"]) * { visibility: hidden; }');
    expect(LAYER_CSS).not.toMatch(/^\.cap-pass\[data-pass\] \* \{/m);
    for (const l of LAYERS.filter((x) => x !== "fondo")) expect(LAYER_CSS).toContain(`.cap-pass[data-pass="${l}"] [data-capa="${l}"] * { visibility: visible; }`);
  });

  it("reconoce PNG y ZIP verdaderos por su firma", () => {
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(true);
    expect(isPng(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(isZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(true);
    expect(isZip(new Uint8Array([0x4d, 0x5a, 0, 0, 0]))).toBe(false);
  });
});

/** Con ffmpeg real: FFMPEG_BIN y FFPROBE_BIN (o ffmpeg y ffprobe en el PATH). */
const ffmpegBin = process.env.FFMPEG_BIN || "ffmpeg";
const ffprobeBin = process.env.FFPROBE_BIN || "ffprobe";
const hasFfmpeg = spawnSync(ffmpegBin, ["-version"]).status === 0 && spawnSync(ffprobeBin, ["-version"]).status === 0;

(hasFfmpeg ? describe : describe.skip)("carrusel animado con ffmpeg real", () => {
  it("el filtro es válido: sale 1080×1350, H.264, sin audio, con la duración pedida y las capas aparecen con el tiempo", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pdq-anim-"));
    try {
      const rect = (w: number, h: number, x: number, y: number, fill: string) => Buffer.from(`<svg width="${CLIP_W}" height="${CLIP_H}" xmlns="http://www.w3.org/2000/svg"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/></svg>`);
      const files = {
        fondo: await sharp({ create: { width: CLIP_W, height: CLIP_H, channels: 3, background: "#191BDF" } }).png().toBuffer(),
        icono: await sharp(rect(200, 200, 80, 300, "#FE6807")).png().toBuffer(),
        titulo: await sharp(rect(900, 160, 80, 600, "#FFFFFF")).png().toBuffer(),
        cuerpo: await sharp(rect(900, 100, 80, 850, "#00FF00")).png().toBuffer(),
      };
      const layers: Record<string, string> = {};
      for (const [k, buf] of Object.entries(files)) {
        layers[k] = path.join(dir, `${k}.png`);
        await writeFile(layers[k]!, buf);
      }
      const out = path.join(dir, "out.mp4");
      const r = spawnSync(ffmpegBin, clipArgs({ layers, seconds: 5, output: out }), { encoding: "utf8", timeout: 120_000 });
      expect(r.status, r.stderr).toBe(0);

      const j = JSON.parse(spawnSync(ffprobeBin, ["-v", "error", "-print_format", "json", "-show_entries", "format=duration:stream=width,height,codec_type,codec_name,r_frame_rate", out], { encoding: "utf8" }).stdout) as {
        format: { duration: string };
        streams: { codec_type: string; codec_name: string; width: number; height: number; r_frame_rate: string }[];
      };
      const v = j.streams.find((s) => s.codec_type === "video")!;
      expect([v.width, v.height, v.codec_name, v.r_frame_rate]).toEqual([CLIP_W, CLIP_H, "h264", `${FPS}/1`]);
      expect(j.streams.some((s) => s.codec_type === "audio")).toBe(false);
      expect(Math.abs(Number(j.format.duration) - 5)).toBeLessThan(0.2);

      // Al inicio solo está el fondo; al final ya entraron las piezas (el rectángulo blanco del título).
      const pixel = async (t: number) => {
        const png = path.join(dir, `f${t}.png`);
        spawnSync(ffmpegBin, ["-y", "-loglevel", "error", "-ss", String(t), "-i", out, "-frames:v", "1", png]);
        const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
        const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
        return at(300, 680); // dentro del rectángulo del título
      };
      const early = await pixel(0.05);
      const late = await pixel(4.5);
      expect(early[2]).toBeGreaterThan(180); // todavía azul de fondo
      expect(early[0]).toBeLessThan(80);
      expect(late[0]).toBeGreaterThan(220); // ya blanco
      expect(late[1]).toBeGreaterThan(220);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 150_000);
});
