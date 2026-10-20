import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Prueba con ffmpeg REAL (no simulado). Solo corre si FFMPEG_BIN y FFPROBE_BIN apuntan a los ejecutables:
 *   FFMPEG_BIN=/ruta/ffmpeg FFPROBE_BIN=/ruta/ffprobe npx vitest run tests/ffmpeg-real.test.ts
 * Comprueba que el filtro de la edición (cortes, acercamientos, subtítulos con tipografías del kit y portada) sí es válido.
 */
const FF = process.env.FFMPEG_BIN;
const FP = process.env.FFPROBE_BIN;
const run = FF && FP ? describe : describe.skip;

const sh = (bin: string, args: string[]) => {
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${path.basename(bin)} falló (${r.status}): ${r.stderr.slice(-600)}`);
  return r.stdout;
};
const probe = (file: string) => {
  const j = JSON.parse(sh(FP!, ["-v", "error", "-print_format", "json", "-show_entries", "format=duration:stream=width,height,codec_type,codec_name", file])) as { format: { duration: string }; streams: { codec_type: string; width?: number; height?: number; codec_name: string }[] };
  return { duration: Number(j.format.duration), v: j.streams.find((s) => s.codec_type === "video")!, a: j.streams.find((s) => s.codec_type === "audio") };
};

run("ffmpeg real", () => {
  it("une partes de distintos formatos, edita con cortes, planos, subtítulos y portada", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pdq-real-"));
    try {
      // Tres partes "grabadas": 3:4 mp4, 9:16 mp4 y webm, cada una con audio.
      const mk = (name: string, size: string, secs: number, freq: number) => sh(FF!, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=30`, "-f", "lavfi", "-i", `sine=frequency=${freq}:sample_rate=44100`, "-t", String(secs), name.endsWith(".webm") ? "-c:v" : "-pix_fmt", name.endsWith(".webm") ? "libvpx" : "yuv420p", path.join(dir, name)]);
      mk("gancho.mp4", "720x960", 4, 440);
      mk("cuerpo.webm", "720x1280", 8, 660);
      mk("cierre.mp4", "1080x1920", 5, 880);

      const { joinArgs } = await import("@/lib/recording/ffmpeg");
      const joined = path.join(dir, "completo.mp4");
      sh(FF!, joinArgs([path.join(dir, "gancho.mp4"), path.join(dir, "cuerpo.webm"), path.join(dir, "cierre.mp4")], joined));
      const j = probe(joined);
      expect(j.v.width).toBe(1080);
      expect(j.v.height).toBe(1920);
      expect(j.v.codec_name).toBe("h264");
      expect(j.a?.codec_name).toBe("aac");
      expect(j.duration).toBeGreaterThan(16.5);
      expect(j.duration).toBeLessThan(17.6);

      // Plan de edición: quita 4 s del medio, planos alternados, golpe, subtítulos resaltados, gancho, llamada a la acción y portada.
      const { planSchema, EMPTY_OVERRIDES } = await import("@/lib/edit/schemas");
      const { activeCuts, keepSegments, buildAss, buildCoverAss, editedDuration } = await import("@/lib/edit/timeline");
      const { buildFilterScript, editArgs, coverArgs } = await import("@/lib/edit/render-args");
      const { resolveKitFont, stageFonts } = await import("@/lib/edit/fonts");
      const plan = planSchema.parse({
        cortes: [{ inicio_s: 6, fin_s: 10, motivo: "silencio", texto: "" }],
        encuadres: [{ inicio_s: 0, fin_s: 5, plano: "normal" }, { inicio_s: 5, fin_s: 12, plano: "cercano" }, { inicio_s: 12, fin_s: 17, plano: "muy_cercano" }],
        zooms: [{ inicio_s: 0.2, fin_s: 1.4, tipo: "golpe", motivo: "" }, { inicio_s: 13, fin_s: 15, tipo: "acercamiento_suave", motivo: "" }],
        textos_pantalla: [{ tipo: "gancho", inicio_s: 0, fin_s: 3, texto: "Deja de regar de más", estilo: "ganchos" }, { tipo: "seccion", inicio_s: 5, fin_s: 8, texto: "El error 1", estilo: "" }, { tipo: "cta", inicio_s: 14, fin_s: 17, texto: "Guárdalo para después", estilo: "" }],
        subtitulos: { lineas: [{ inicio_s: 3, fin_s: 5, texto: "Esto cambia tu huerto ñandú ¡sí!", resaltar: ["huerto"] }, { inicio_s: 10.5, fin_s: 12, texto: "Hola, cómo estás", resaltar: [] }] },
        portada: { segundo: 11, porque: "", titulo: "Así salvé mi huerto", resaltar: "huerto", elementos: [] },
      });
      const segs = keepSegments(j.duration, activeCuts(plan.cortes, []));
      const tf = await resolveKitFont("DM Serif Display", "titulo");
      const xf = await resolveKitFont("Bricolage Grotesque", "texto");
      const fontsDir = path.join(dir, "fonts");
      await mkdir(fontsDir);
      await stageFonts(fontsDir, [tf, xf]);
      const kit = { titleFont: tf.fullName, textFont: xf.fullName, textColor: "#FFFFFF", highlightColor: "#FE6807", titleColor: "#FFFFFF", detailColor: "#AE0091", boxColor: "#191BDF", uppercase: false };
      const assPath = path.join(dir, "edicion.ass");
      await writeFile(assPath, buildAss({ plan, overrides: EMPTY_OVERRIDES, segs, kit }));
      const { script, hasZoom } = buildFilterScript({ segs, plan, assPath, fontsDir });
      expect(hasZoom).toBe(true);
      const out = path.join(dir, "editado.mp4");
      sh(FF!, editArgs(joined, script, out));
      const e = probe(out);
      expect(e.v.width).toBe(1080);
      expect(e.v.height).toBe(1920);
      expect(e.a).toBeTruthy();
      expect(Math.abs(e.duration - editedDuration(segs))).toBeLessThan(0.6);

      const coverAss = path.join(dir, "portada.ass");
      await writeFile(coverAss, buildCoverAss(plan.portada!.titulo, plan.portada!.resaltar, kit));
      const png = path.join(dir, "portada.png");
      sh(FF!, coverArgs(joined, plan.portada!.segundo, coverAss, fontsDir, png));
      const c = probe(png);
      expect(c.v.width).toBe(1080);
      expect(c.v.height).toBe(1920);
      // Para revisar a ojo: PDQ_KEEP=/carpeta guarda la portada y dos cuadros del video editado.
      if (process.env.PDQ_KEEP) {
        await mkdir(process.env.PDQ_KEEP, { recursive: true });
        const { copyFile } = await import("node:fs/promises");
        await copyFile(png, path.join(process.env.PDQ_KEEP, "portada.png"));
        for (const s of [1, 4.5, 9]) sh(FF!, ["-y", "-loglevel", "error", "-ss", String(s), "-i", out, "-frames:v", "1", path.join(process.env.PDQ_KEEP, `cuadro-${s}.png`)]);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
