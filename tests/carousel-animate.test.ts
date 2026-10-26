import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  animationPlanSchema,
  BUCLES,
  clipArgs,
  clipPlanSchema,
  CLIP_H,
  CLIP_W,
  defaultPlan,
  ENTRADAS,
  entryTimes,
  FONDO_EFECTOS,
  FPS,
  groupLayers,
  INTENSIDADES,
  isPng,
  isZip,
  LAYER_CSS,
  LAYERS,
  normalizeBox,
  parseBoxes,
  sanitizePlan,
  slideSeconds,
  slideTexts,
  type ClipPlan,
} from "@/lib/carousel/animate";

const plan = (over: Partial<ClipPlan> = {}): ClipPlan => ({ duracion_s: 5, fondo: { efecto: "respirar", intensidad: "suave" }, capas: {}, porque: "", ...over });

describe("tiempos y plan por defecto", () => {
  it("cada clip dura lo que tarda en leerse, entre 4 y 6 segundos", () => {
    expect(slideSeconds(["Hola"])).toBe(4);
    expect(slideSeconds([Array(200).fill("palabra").join(" ")])).toBe(6);
    expect(slideSeconds([Array(12).fill("palabra").join(" ")])).toBeCloseTo(5.5);
    expect(slideTexts({ titulo: "A", cuerpo: null, dato: " ", etiqueta: "B" })).toEqual(["A", "B"]);
  });

  it("el plan de siempre hace entrar las piezas una tras otra y el ícono primero", () => {
    const t = entryTimes({ icono: true, titulo: true, cuerpo: true, extra: true });
    expect(t.icono!).toBeLessThan(t.titulo!);
    expect(t.titulo!).toBeLessThan(t.cuerpo!);
    expect(t.cuerpo!).toBeLessThan(t.extra!);
    const d = defaultPlan({ icono: true, titulo: true }, 5);
    expect(d.fondo.efecto).toBe("respirar");
    expect(Object.keys(d.capas)).toEqual(["icono", "titulo"]);
    expect(d.capas.icono!.entrada).toBe("rebote");
  });
});

describe("plan de animación de la IA", () => {
  it("acepta lo que ya está bien y se recupera de valores raros sin tumbar la respuesta", () => {
    const ok = clipPlanSchema.parse({ duracion_s: 6, fondo: { efecto: "acercar", intensidad: "media" }, capas: { titulo: { entrada: "revelar", retraso_s: 0.5, duracion_s: 0.9, bucle: "ninguno" } }, porque: "El título se descubre." });
    expect(ok.fondo.efecto).toBe("acercar");
    expect(ok.capas.titulo!.entrada).toBe("revelar");

    const raro = clipPlanSchema.parse({ duracion_s: "99", fondo: { efecto: "explotar", intensidad: null }, capas: { titulo: { entrada: "girar_3d", retraso_s: null, duracion_s: "x", bucle: 7 } }, porque: null });
    expect(raro.duracion_s).toBe(8); // tope
    expect(raro.fondo).toMatchObject({ efecto: "respirar", intensidad: "suave" });
    expect(raro.capas.titulo).toMatchObject({ entrada: "subir", bucle: "ninguno" });
    expect(raro.porque).toBe("");
  });

  it("el plan del carrusel pide un elemento por slide con su número", () => {
    const r = animationPlanSchema.parse({ hilo_comun: null, slides: [{ n: "1", capas: {} }, { n: 2 }] });
    expect(r.slides.map((s) => s.n)).toEqual([1, 2]);
    expect(animationPlanSchema.safeParse({ slides: [] }).success).toBe(false);
  });

  it("deja el plan en algo seguro: solo piezas que existen, sin zoom si no hay caja, y todo termina con margen", () => {
    const raw = clipPlanSchema.parse({
      duracion_s: 4,
      capas: {
        icono: { entrada: "zoom", retraso_s: 0.2, duracion_s: 0.7, bucle: "pulso" },
        titulo: { entrada: "revelar", retraso_s: 3.4, duracion_s: 1.4 }, // demasiado tarde
        cuerpo: { entrada: "subir", retraso_s: 1, duracion_s: 0.6 }, // el slide no tiene cuerpo
      },
    });
    const sin = sanitizePlan(raw, { icono: true, titulo: true }, {});
    expect(sin.capas.cuerpo).toBeUndefined();
    expect(sin.capas.icono).toMatchObject({ entrada: "aparecer", bucle: "ninguno" }); // sin caja no hay zoom ni pulso
    const t = sin.capas.titulo!;
    expect(t.retraso_s + t.duracion_s).toBeLessThanOrEqual(4 - 0.8 + 1e-9);

    const con = sanitizePlan(raw, { icono: true, titulo: true }, { icono: { x: 0, y: 0, w: 100, h: 100 } });
    expect(con.capas.icono).toMatchObject({ entrada: "zoom", bucle: "pulso" });
  });

  it("una pieza que existe pero la IA no mencionó se anima con el plan de siempre", () => {
    const out = sanitizePlan(plan(), { titulo: true }, {});
    expect(out.capas.titulo).toBeDefined();
  });
});

describe("cajas de las piezas", () => {
  it("se dejan dentro del lienzo, en pares y con margen; lo inválido se descarta", () => {
    const b = normalizeBox({ x: 100.3, y: 200.6, w: 301, h: 99 })!;
    expect(b.x % 2 + b.y % 2 + b.w % 2 + b.h % 2).toBe(0);
    expect(b.x).toBeLessThan(100);
    expect(b.x + b.w).toBeGreaterThan(401);
    const edge = normalizeBox({ x: 1000, y: 1300, w: 500, h: 500 })!;
    expect(edge.x + edge.w).toBeLessThanOrEqual(CLIP_W);
    expect(edge.y + edge.h).toBeLessThanOrEqual(CLIP_H);
    expect(normalizeBox({ x: "a", y: 0, w: 1, h: 1 })).toBeNull();
    expect(normalizeBox(null)).toBeNull();
  });

  it("lee cajas.json e ignora lo que no es válido", () => {
    const m = parseBoxes({ "1": { titulo: { x: 10, y: 10, w: 500, h: 100 }, otra: { x: 1, y: 1, w: 1, h: 1 }, cuerpo: "no" }, x: {}, "2": null });
    expect([...m.keys()]).toEqual([1]);
    expect(Object.keys(m.get(1)!)).toEqual(["titulo"]);
    expect(parseBoxes("basura").size).toBe(0);
  });
});

describe("argumentos de ffmpeg", () => {
  const boxes = { titulo: { x: 56, y: 576, w: 948, h: 208 }, icono: { x: 56, y: 300, w: 200, h: 200 } };
  const argsOf = (p: ClipPlan, layers = { fondo: "f.png", icono: "i.png", titulo: "t.png" }) => clipArgs({ layers, boxes, plan: p, output: "out.mp4" });
  const graphOf = (a: string[]) => a[a.indexOf("-filter_complex") + 1]!;

  it("una entrada de video por capa, sin audio, y el tiempo en cada entrada", () => {
    const a = argsOf(plan({ capas: { icono: { entrada: "rebote", retraso_s: 0.2, duracion_s: 0.7, bucle: "ninguno" }, titulo: { entrada: "subir", retraso_s: 0.8, duracion_s: 0.6, bucle: "ninguno" } } }));
    expect(a.filter((x) => x === "-i")).toHaveLength(3);
    expect(a).toContain("-an");
    expect(a.at(-1)).toBe("out.mp4");
    expect(a.slice(0, 12).join(" ")).toContain(`-framerate ${FPS}`);
    expect(graphOf(a).match(/overlay=/g)).toHaveLength(2);
  });

  it("cada movimiento usa el filtro que le toca", () => {
    const entr = (entrada: (typeof ENTRADAS)[number], bucle: (typeof BUCLES)[number] = "ninguno") =>
      graphOf(argsOf(plan({ capas: { titulo: { entrada, retraso_s: 0.5, duracion_s: 0.8, bucle } } }), { fondo: "f.png", icono: "", titulo: "t.png" }));
    expect(entr("revelar")).toContain("geq=");
    expect(entr("revelar")).toContain("(T-0.5)"); // el tiempo en geq es T
    expect(entr("revelar")).not.toContain("fade=");
    expect(entr("zoom")).toContain("overlay_w/2");
    expect(entr("subir", "pulso")).toContain("overlay_w/2");
    expect(entr("subir", "flotar")).toContain("sin(2*PI");
    expect(entr("aparecer")).not.toContain("scale=w='max(2");
    expect(entr("izquierda")).toContain("-140*pow");
  });

  it("el fondo se mueve como pide el plan", () => {
    const g = (efecto: ClipPlan["fondo"]["efecto"], intensidad: ClipPlan["fondo"]["intensidad"] = "suave") => graphOf(clipArgs({ layers: { fondo: "f.png" }, plan: plan({ fondo: { efecto, intensidad } }), output: "o.mp4" }));
    expect(g("respirar")).toContain("sin(PI*t/5)");
    expect(g("acercar")).toContain("1+0.06*t/5");
    expect(g("acercar", "media")).toContain("1+0.1*t/5");
    expect(g("paneo_derecha")).toContain("(iw-ow)*t/5");
    expect(g("paneo_izquierda")).toContain("(iw-ow)*(1-t/5)");
    expect(g("quieto")).not.toContain("eval=frame");
  });

  it("solo con fondo es un clip válido; sin él, o con una duración imposible, no", () => {
    expect(graphOf(clipArgs({ layers: { fondo: "f.png" }, plan: plan(), output: "o.mp4" }))).not.toContain("overlay=");
    expect(() => clipArgs({ layers: { titulo: "t.png" }, plan: plan(), output: "o.mp4" })).toThrow(/fondo/);
    expect(() => clipArgs({ layers: { fondo: "f.png" }, plan: plan({ duracion_s: 40 }), output: "o.mp4" })).toThrow(/duración/);
  });
});

describe("archivos del ZIP", () => {
  it("agrupa por slide e ignora los que no tienen el nombre esperado", () => {
    const g = groupLayers({ "01_fondo.png": 1, "01_titulo.png": 2, "02_fondo.png": 3, "02_otra.png": 4, "x/03_fondo.png": 5, "cajas.json": 6 });
    expect([...g.keys()]).toEqual([1, 2]);
    expect(g.get(1)).toEqual({ fondo: 1, titulo: 2 });
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
  const rect = (w: number, h: number, x: number, y: number, fill: string) => Buffer.from(`<svg width="${CLIP_W}" height="${CLIP_H}" xmlns="http://www.w3.org/2000/svg"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/></svg>`);

  async function setup() {
    const dir = await mkdtemp(path.join(tmpdir(), "pdq-anim-"));
    const fondo = path.join(dir, "fondo.png");
    const titulo = path.join(dir, "titulo.png");
    await writeFile(fondo, await sharp({ create: { width: CLIP_W, height: CLIP_H, channels: 3, background: "#191BDF" } }).png().toBuffer());
    await writeFile(titulo, await sharp(rect(900, 160, 80, 600, "#FFFFFF")).png().toBuffer());
    return { dir, fondo, titulo, out: path.join(dir, "out.mp4") };
  }
  const box = { x: 56, y: 576, w: 948, h: 208 };
  const frame = async (dir: string, video: string, sec: number) => {
    const p = path.join(dir, `f${sec}.png`);
    spawnSync(ffmpegBin, ["-y", "-loglevel", "error", "-ss", String(sec), "-i", video, "-frames:v", "1", p]);
    const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
    return (x: number, y: number) => data[(y * info.width + x) * info.channels]!; // canal rojo
  };

  it("todas las entradas, bucles y efectos de fondo del catálogo producen un video válido", async () => {
    const { dir, fondo, titulo, out } = await setup();
    try {
      const bad: string[] = [];
      for (const entrada of ENTRADAS)
        for (const bucle of BUCLES) {
          const r = spawnSync(ffmpegBin, clipArgs({ layers: { fondo, titulo }, boxes: { titulo: box }, plan: plan({ capas: { titulo: { entrada, retraso_s: 0.5, duracion_s: 0.8, bucle } } }), output: out }), { encoding: "utf8", timeout: 60_000 });
          if (r.status !== 0) bad.push(`${entrada}/${bucle}: ${r.stderr.slice(-200)}`);
        }
      for (const efecto of FONDO_EFECTOS)
        for (const intensidad of INTENSIDADES) {
          const r = spawnSync(ffmpegBin, clipArgs({ layers: { fondo }, plan: plan({ duracion_s: 4, fondo: { efecto, intensidad } }), output: out }), { encoding: "utf8", timeout: 60_000 });
          if (r.status !== 0) bad.push(`fondo ${efecto}/${intensidad}: ${r.stderr.slice(-200)}`);
        }
      expect(bad.join("\n---\n")).toBe("");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 600_000);

  it("el video sale 1080×1350, H.264, sin audio y con la duración del plan; la pieza aparece con el tiempo", async () => {
    const { dir, fondo, titulo, out } = await setup();
    try {
      const r = spawnSync(ffmpegBin, clipArgs({ layers: { fondo, titulo }, boxes: { titulo: box }, plan: plan({ capas: { titulo: { entrada: "subir", retraso_s: 1, duracion_s: 0.6, bucle: "ninguno" } } }), output: out }), { encoding: "utf8", timeout: 120_000 });
      expect(r.status, r.stderr).toBe(0);
      const j = JSON.parse(spawnSync(ffprobeBin, ["-v", "error", "-print_format", "json", "-show_entries", "format=duration:stream=width,height,codec_type,codec_name,r_frame_rate", out], { encoding: "utf8" }).stdout) as {
        format: { duration: string };
        streams: { codec_type: string; codec_name: string; width: number; height: number; r_frame_rate: string }[];
      };
      const v = j.streams.find((s) => s.codec_type === "video")!;
      expect([v.width, v.height, v.codec_name, v.r_frame_rate]).toEqual([CLIP_W, CLIP_H, "h264", `${FPS}/1`]);
      expect(j.streams.some((s) => s.codec_type === "audio")).toBe(false);
      expect(Math.abs(Number(j.format.duration) - 5)).toBeLessThan(0.2);
      const early = await frame(dir, out, 0.3);
      const late = await frame(dir, out, 4.5);
      expect(early(300, 680)).toBeLessThan(80); // todavía el azul del fondo
      expect(late(300, 680)).toBeGreaterThan(220); // ya el rectángulo blanco
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 150_000);

  it("«revelar» descubre la pieza de izquierda a derecha", async () => {
    const { dir, fondo, titulo, out } = await setup();
    try {
      const r = spawnSync(ffmpegBin, clipArgs({ layers: { fondo, titulo }, boxes: { titulo: box }, plan: plan({ fondo: { efecto: "quieto", intensidad: "suave" }, capas: { titulo: { entrada: "revelar", retraso_s: 1, duracion_s: 1, bucle: "ninguno" } } }), output: out }), { encoding: "utf8", timeout: 120_000 });
      expect(r.status, r.stderr).toBe(0);
      const mid = await frame(dir, out, 1.5);
      const end = await frame(dir, out, 3);
      expect(mid(200, 680)).toBeGreaterThan(200); // la izquierda ya se ve
      expect(mid(900, 680)).toBeLessThan(80); // la derecha todavía no
      expect(end(900, 680)).toBeGreaterThan(200); // al final, completa
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 150_000);
});
