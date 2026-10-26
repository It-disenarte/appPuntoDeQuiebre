import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { animateArgs, FPS, isPng, isZip, MAX_SLIDES, OUT_H, OUT_W, slideSeconds, slideTexts, totalSeconds, TRANSITION_S } from "@/lib/carousel/animate";

describe("carrusel animado (puro)", () => {
  it("cada slide dura lo que tarda en leerse, con mínimo y máximo, y portada y cierre un poco más", () => {
    expect(slideSeconds(["Hola"], 1, 6)).toBe(3);
    expect(slideSeconds([Array(200).fill("palabra").join(" ")], 1, 6)).toBe(6);
    expect(slideSeconds(["uno dos tres"], 0, 6)).toBe(slideSeconds(["uno dos tres"], 1, 6) + 0.5);
    expect(slideSeconds(["uno dos tres"], 5, 6)).toBe(slideSeconds(["uno dos tres"], 1, 6) + 1);
    expect(slideTexts({ titulo: "A", cuerpo: null, dato: " ", etiqueta: "B" })).toEqual(["A", "B"]);
  });

  it("la duración total descuenta lo que se solapa en cada transición", () => {
    expect(totalSeconds([3, 3, 3])).toBeCloseTo(9 - 2 * TRANSITION_S);
  });

  it("arma el filtro con un clip por slide y una transición menos que slides, sin audio", () => {
    const args = animateArgs({ frames: ["a.png", "b.png", "c.png", "d.png"], seconds: [3.5, 3, 3, 4], background: "#191BDF", output: "out.mp4" });
    expect(args.filter((x) => x === "-i")).toHaveLength(4);
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph.match(/zoompan/g)).toHaveLength(4);
    expect(graph.match(/xfade/g)).toHaveLength(3);
    expect(graph).toContain(`s=${OUT_W}x${OUT_H}`);
    expect(graph).toContain("c=0x191BDF");
    expect(graph).toContain("[v]");
    expect(args).toContain("-an");
    expect(args.at(-1)).toBe("out.mp4");
    // El primer corte empieza cuando acaba el primer slide menos la transición.
    expect(graph).toContain(`offset=${3.5 - TRANSITION_S}`);
  });

  it("alterna acercar y alejar, y un color inválido cae al de respaldo (nunca se mete texto raro al filtro)", () => {
    const args = animateArgs({ frames: ["a.png", "b.png", "c.png"], seconds: [3, 3, 3], background: "red;rm -rf", output: "o.mp4" });
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain("1+0.06*on/");
    expect(graph).toContain("1.06-0.06*on/");
    expect(graph).toContain("c=0x111111");
    expect(graph).not.toContain("rm -rf");
  });

  it("exige entre 3 y 12 slides y una duración por slide", () => {
    expect(() => animateArgs({ frames: ["a.png", "b.png"], seconds: [3, 3], background: "#000000", output: "o.mp4" })).toThrow(/entre 3 y 12/);
    expect(() => animateArgs({ frames: Array(MAX_SLIDES + 1).fill("a.png"), seconds: Array(MAX_SLIDES + 1).fill(3), background: "#000000", output: "o.mp4" })).toThrow();
    expect(() => animateArgs({ frames: ["a.png", "b.png", "c.png"], seconds: [3, 3], background: "#000000", output: "o.mp4" })).toThrow(/duración/);
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
  it("el filtro es válido y el video sale 1080×1920, H.264, sin audio y con la duración esperada", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pdq-anim-"));
    try {
      const colors = ["#191BDF", "#FE6807", "#FFFFFF", "#09080D"];
      const frames: string[] = [];
      for (const [i, c] of colors.entries()) {
        const f = path.join(dir, `s${i}.png`);
        await writeFile(f, await sharp({ create: { width: 1080, height: 1350, channels: 3, background: c } }).png().toBuffer());
        frames.push(f);
      }
      const seconds = [3, 3, 3, 3];
      const out = path.join(dir, "out.mp4");
      const r = spawnSync(ffmpegBin, animateArgs({ frames, seconds, background: "#191BDF", output: out }), { encoding: "utf8", timeout: 120_000 });
      expect(r.status, r.stderr).toBe(0);
      const j = JSON.parse(spawnSync(ffprobeBin, ["-v", "error", "-print_format", "json", "-show_entries", "format=duration:stream=width,height,codec_type,codec_name,r_frame_rate", out], { encoding: "utf8" }).stdout) as {
        format: { duration: string };
        streams: { codec_type: string; codec_name: string; width: number; height: number; r_frame_rate: string }[];
      };
      const v = j.streams.find((s) => s.codec_type === "video")!;
      expect([v.width, v.height, v.codec_name]).toEqual([OUT_W, OUT_H, "h264"]);
      expect(j.streams.some((s) => s.codec_type === "audio")).toBe(false);
      expect(v.r_frame_rate).toBe(`${FPS}/1`);
      expect(Number(j.format.duration)).toBeGreaterThan(totalSeconds(seconds) - 0.3);
      expect(Number(j.format.duration)).toBeLessThan(totalSeconds(seconds) + 0.3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 150_000);
});
