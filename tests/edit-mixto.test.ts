import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFilterScript, editArgs } from "@/lib/edit/render-args";
import { EMPTY_OVERRIDES, normalizePlan, planSchema, type Plan } from "@/lib/edit/schemas";
import { buildAss, blurRanges, checkPlan, editedDuration, mapRange, mixtoSegments, planSegments, segsFor, zoomExpression, type AssStyleKit } from "@/lib/edit/timeline";

const kit: AssStyleKit = { titleFont: "Poppins", textFont: "Nunito", textColor: "#FFFFFF", highlightColor: "#FE6807", titleColor: "#FFFFFF", detailColor: "#191BDF", boxColor: null, uppercase: false };
const mixto = (p: Partial<Plan> = {}): Plan =>
  planSchema.parse({
    modo: "mixto",
    linea_de_tiempo: [
      { tramo: 1, tipo: "gancho_prestado", inicio_s: 20, fin_s: 23, audio: "propio", que_se_ve: "La frase fuerte" },
      { tramo: 2, tipo: "habla", inicio_s: 2, fin_s: 10, audio: "propio", que_se_ve: "Selfie" },
      { tramo: 3, tipo: "apoyo", inicio_s: 12, fin_s: 14, audio: "silencio", que_se_ve: "El micrófono" },
      { tramo: 4, tipo: "habla", inicio_s: 18, fin_s: 25, audio: "propio", que_se_ve: "Cierre" },
    ],
    privacidad: [],
    ...p,
  });

describe("línea de tiempo del modo mixto", () => {
  it("acomoda los tramos en el orden de la IA (el gancho prestado se repite) y marca los apoyos en silencio", () => {
    const segs = mixtoSegments(mixto(), 30);
    expect(segs.map((s) => [s.tramo, s.a, s.b, s.offset, Boolean(s.silent)])).toEqual([
      [1, 20, 23, 0, false],
      [2, 2, 10, 3, false],
      [3, 12, 14, 11, true],
      [4, 18, 25, 13, false],
    ]);
    expect(editedDuration(segs)).toBe(20);
    expect(planSegments(mixto(), EMPTY_OVERRIDES, 30)).toEqual(segs);
  });

  it("un rango que aparece en dos tramos se pone en los dos, o solo en el que se pide", () => {
    const segs = mixtoSegments(mixto(), 30);
    expect(mapRange(21, 22, segs)).toEqual([{ a: 1, b: 2 }, { a: 16, b: 17 }]); // el gancho prestado y su lugar original (tramo 4: 18–25)
    expect(mapRange(21, 22, segsFor(segs, 1))).toEqual([{ a: 1, b: 2 }]);
    expect(mapRange(21, 22, segsFor(segs, 4))).toEqual([{ a: 16, b: 17 }]);
  });

  it("lo que se corta por privacidad sale de los tramos y lo que se difumina se ve difuminado", () => {
    const p = mixto({ privacidad: [{ inicio_s: 4, fin_s: 6, accion: "cortar", porque: "dirección" }, { inicio_s: 23, fin_s: 24, accion: "difuminar", porque: "usuario en pantalla" }] });
    const segs = mixtoSegments(p, 30);
    expect(segs.filter((s) => s.tramo === 2).map((s) => [s.a, s.b])).toEqual([[2, 4], [6, 10]]);
    expect(editedDuration(segs)).toBe(18);
    expect(blurRanges(p, segs)).toEqual([{ a: 16, b: 17 }]); // 23–24 s del original: solo cae en el tramo 4 (el 1 termina en 23), ya recorrido por los 2 s cortados
  });

  it("los textos y acercamientos de un tramo no aparecen en los otros", () => {
    const p = mixto({
      textos_pantalla: [{ tipo: "gancho", inicio_s: 20, fin_s: 23, texto: "Una vez que empiezas", estilo: "", tramo: 1 }],
      zooms: [{ inicio_s: 21, fin_s: 22, tipo: "golpe", motivo: "", tramo: 1 }],
    });
    const segs = mixtoSegments(p, 30);
    const ass = buildAss({ plan: p, overrides: EMPTY_OVERRIDES, segs, kit });
    expect(ass.split("\n").filter((l) => l.includes(",Hook,"))).toHaveLength(1);
    expect(ass).toContain("0:00:00.00,0:00:03.00,Hook");
    expect(zoomExpression(p, segs)).toContain("0.12*min(clip((t-1)");
    expect(checkPlan(p, EMPTY_OVERRIDES, 30).finalSeconds).toBe(20);
  });

  it("la IA no puede salirse del video: se ajusta y se renumera", () => {
    const p = normalizePlan(mixto({ linea_de_tiempo: [{ tramo: 9, tipo: "habla", inicio_s: -4, fin_s: 5, audio: "propio", que_se_ve: "" }, { tramo: 3, tipo: "apoyo", inicio_s: 90, fin_s: 99, audio: "silencio", que_se_ve: "" }] }), 30);
    expect(p.linea_de_tiempo.map((l) => [l.tramo, l.inicio_s, l.fin_s])).toEqual([[1, 0, 5]]);
  });
});

const FF = process.env.FFMPEG_BIN;
const FP = process.env.FFPROBE_BIN;
(FF && FP ? describe : describe.skip)("modo mixto con ffmpeg real", () => {
  const sh = (bin: string, args: string[]) => {
    const r = spawnSync(bin, args, { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`${path.basename(bin)} falló: ${r.stderr.slice(-500)}`);
    return r.stdout;
  };
  it("repite el gancho, silencia el apoyo, difumina y corta por privacidad", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pdq-mixto-"));
    try {
      const src = path.join(dir, "original.mp4");
      sh(FF!, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30", "-f", "lavfi", "-i", "sine=frequency=500:sample_rate=44100", "-t", "30", "-pix_fmt", "yuv420p", src]);
      const p = normalizePlan(
        mixto({
          privacidad: [{ inicio_s: 4, fin_s: 6, accion: "cortar", porque: "" }, { inicio_s: 23, fin_s: 24, accion: "difuminar", porque: "" }],
          textos_pantalla: [{ tipo: "gancho", inicio_s: 20, fin_s: 23, texto: "Una vez que empiezas", estilo: "", tramo: 1 }],
          zooms: [{ inicio_s: 21, fin_s: 22, tipo: "golpe", motivo: "", tramo: 1 }],
          encuadres: [{ inicio_s: 2, fin_s: 10, plano: "cercano", tramo: 2 }],
        }),
        30,
      );
      const segs = mixtoSegments(p, 30);
      const { resolveKitFont, stageFonts } = await import("@/lib/edit/fonts");
      const tf = await resolveKitFont("Poppins", "titulo");
      const xf = await resolveKitFont("Nunito", "texto");
      const fonts = path.join(dir, "fonts");
      await mkdir(fonts);
      await stageFonts(fonts, [tf, xf]);
      const ass = path.join(dir, "e.ass");
      await writeFile(ass, buildAss({ plan: p, overrides: EMPTY_OVERRIDES, segs, kit: { ...kit, titleFont: tf.fullName, textFont: xf.fullName } }));
      const { script } = buildFilterScript({ segs, plan: p, assPath: ass, fontsDir: fonts });
      expect(script).toContain("volume=0");
      expect(script).toContain("boxblur");
      const out = path.join(dir, "out.mp4");
      sh(FF!, editArgs(src, script, out));
      const j = JSON.parse(sh(FP!, ["-v", "error", "-print_format", "json", "-show_entries", "format=duration:stream=width,height,codec_type", out])) as { format: { duration: string }; streams: { codec_type: string; width?: number; height?: number }[] };
      expect(Math.abs(Number(j.format.duration) - editedDuration(segs))).toBeLessThan(0.6);
      const v = j.streams.find((s) => s.codec_type === "video")!;
      expect([v.width, v.height]).toEqual([1080, 1920]);
      expect(j.streams.some((s) => s.codec_type === "audio")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
