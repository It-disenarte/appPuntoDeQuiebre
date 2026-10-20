import { describe, expect, it } from "vitest";
import { buildFilterScript, coverArgs, editArgs, filterPath } from "@/lib/edit/render-args";
import { EMPTY_OVERRIDES, normalizePlan, planSchema, type Plan } from "@/lib/edit/schemas";
import { activeCuts, buildAss, buildCoverAss, checkPlan, editedDuration, keepSegments, mapPoint, mapRange, zoomExpression, type AssStyleKit } from "@/lib/edit/timeline";

const plan = (p: Partial<Plan> = {}): Plan => planSchema.parse({ cortes: [], subtitulos: { lineas: [] }, zooms: [], textos_pantalla: [], encuadres: [], ...p });
const kit: AssStyleKit = { titleFont: "DM Serif Display", textFont: "Bricolage Grotesque", textColor: "#FFFFFF", highlightColor: "#FE6807", titleColor: "#FFFFFF", detailColor: "#AE0091", boxColor: null, uppercase: false };

describe("cortes y tiempos", () => {
  it("achica cada corte 0.05 s por lado, une los que se tocan y respeta los restaurados", () => {
    const p = plan({ cortes: [{ inicio_s: 2, fin_s: 3, motivo: "saludo", texto: "hola" }, { inicio_s: 2.9, fin_s: 4, motivo: "silencio", texto: "" }, { inicio_s: 10, fin_s: 11, motivo: "silencio", texto: "" }] });
    expect(activeCuts(p.cortes, [])).toEqual([{ a: 2.05, b: 3.95 }, { a: 10.05, b: 10.95 }]);
    expect(activeCuts(p.cortes, [2])).toEqual([{ a: 2.05, b: 3.95 }]);
    expect(activeCuts(p.cortes, [0, 1, 2])).toEqual([]);
  });

  it("calcula lo que se queda y recorre los tiempos del original al editado", () => {
    const segs = keepSegments(20, [{ a: 5, b: 8 }, { a: 12, b: 14 }]);
    expect(segs).toEqual([{ a: 0, b: 5, offset: 0 }, { a: 8, b: 12, offset: 5 }, { a: 14, b: 20, offset: 9 }]);
    expect(editedDuration(segs)).toBe(15);
    expect(mapPoint(9, segs)).toBe(6);
    expect(mapPoint(6, segs)).toBe(5); // cae dentro de un corte: el punto más cercano
    expect(mapRange(4, 9, segs)).toEqual([{ a: 4, b: 5 }, { a: 5, b: 6 }].length ? [{ a: 4, b: 6 }] : []); // 4–5 y 5–6 quedan pegados
    expect(mapRange(5.5, 7.5, segs)).toEqual([]); // todo dentro del corte
    expect(keepSegments(10, [])).toEqual([{ a: 0, b: 10, offset: 0 }]);
  });

  it("avisa cuando el video pasa de 61 s o no trae gancho", () => {
    const longPlan = plan({ textos_pantalla: [{ tipo: "gancho", inicio_s: 0, fin_s: 3, texto: "Hola", estilo: "" }] });
    expect(checkPlan(longPlan, EMPTY_OVERRIDES, 70).warnings.map((w) => w.code)).toContain("duracion");
    expect(checkPlan(longPlan, EMPTY_OVERRIDES, 50).warnings).toEqual([]);
    expect(checkPlan(plan(), EMPTY_OVERRIDES, 50).warnings.map((w) => w.code)).toEqual(["sin_gancho"]);
    // Restaurar un corte devuelve su tiempo.
    const cut = plan({ textos_pantalla: [{ tipo: "gancho", inicio_s: 0, fin_s: 3, texto: "x", estilo: "" }], cortes: [{ inicio_s: 10, fin_s: 25, motivo: "duracion", texto: "" }] });
    expect(checkPlan(cut, EMPTY_OVERRIDES, 70).finalSeconds).toBeCloseTo(55.1, 1);
    expect(checkPlan(cut, { ...EMPTY_OVERRIDES, restored: [0] }, 70).warnings.map((w) => w.code)).toContain("duracion");
  });
});

describe("normalizar el plan de la IA", () => {
  it("ajusta tiempos fuera del video, quita lo vacío y no deja planos iguales seguidos ni traslapados", () => {
    const p = normalizePlan(
      plan({
        cortes: [{ inicio_s: -3, fin_s: 2, motivo: "saludo", texto: "" }, { inicio_s: 40, fin_s: 90, motivo: "cola", texto: "" }, { inicio_s: 5, fin_s: 5.01, motivo: "silencio", texto: "" }],
        encuadres: [{ inicio_s: 0, fin_s: 4, plano: "normal" }, { inicio_s: 4, fin_s: 8, plano: "normal" }, { inicio_s: 7, fin_s: 12, plano: "cercano" }, { inicio_s: 12, fin_s: 14, plano: "muy_cercano" }],
        subtitulos: { lineas: [{ inicio_s: 1, fin_s: 2, texto: "  ", resaltar: [] }, { inicio_s: 2, fin_s: 3, texto: "Hola", resaltar: [] }] },
        resumen: ["a", "b", "c", "d", "e", "f"],
      }),
      50,
    );
    expect(p.cortes).toEqual([{ inicio_s: 0, fin_s: 2, motivo: "saludo", texto: "" }, { inicio_s: 40, fin_s: 50, motivo: "cola", texto: "" }]);
    expect(p.encuadres.map((e) => [e.plano, e.inicio_s, e.fin_s])).toEqual([["normal", 0, 8], ["cercano", 8, 12], ["muy_cercano", 12, 14]]);
    expect(p.subtitulos.lineas).toHaveLength(1);
    expect(p.resumen).toHaveLength(4);
  });
});

describe("acercamientos", () => {
  it("sin planos ni zooms no hay acercamiento; con ellos hay una expresión con tope", () => {
    const segs = keepSegments(30, []);
    expect(zoomExpression(plan(), segs)).toBe("1");
    const z = zoomExpression(plan({ encuadres: [{ inicio_s: 0, fin_s: 4, plano: "cercano" }], zooms: [{ inicio_s: 1, fin_s: 2, tipo: "golpe", motivo: "" }] }), segs);
    expect(z).toMatch(/^min\(1\.4,1\+/);
    expect(z).toContain("0.2*min(clip(");
    expect(z).toContain("0.12*min(clip(");
    expect(zoomExpression(plan({ encuadres: [{ inicio_s: 0, fin_s: 4, plano: "muy_cercano" }] }), segs, true)).toMatch(/^min\(1\.15,/); // baja resolución
  });
  it("los tramos se recorren cuando se quitan cortes", () => {
    const segs = keepSegments(30, [{ a: 2, b: 5 }]);
    const z = zoomExpression(plan({ encuadres: [{ inicio_s: 5, fin_s: 9, plano: "cercano" }] }), segs);
    expect(z).toContain("(t-2)"); // el plano que empezaba en 5 ahora empieza en 2
  });
});

describe("subtítulos y textos (ASS)", () => {
  const p = plan({
    textos_pantalla: [{ tipo: "gancho", inicio_s: 0, fin_s: 3, texto: "Deja de hacer esto", estilo: "ganchos" }, { tipo: "cta", inicio_s: 20, fin_s: 24, texto: "Guárdalo", estilo: "" }],
    subtitulos: { lineas: [{ inicio_s: 0, fin_s: 2.5, texto: "Deja de hacer esto", resaltar: [] }, { inicio_s: 3, fin_s: 5, texto: "Esto cambia tu día {x}", resaltar: ["cambia"] }, { inicio_s: 9, fin_s: 10, texto: "Se corta", resaltar: [] }] },
  });
  const segs = keepSegments(30, [{ a: 8, b: 12 }]);
  const ass = buildAss({ plan: p, overrides: EMPTY_OVERRIDES, segs, kit });

  it("trae los estilos con las fuentes del kit y la zona segura", () => {
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("Style: Sub,Bricolage Grotesque,");
    expect(ass).toContain("Style: Hook,DM Serif Display,");
    expect(ass).toMatch(/Style: Sub,.*,2,70,70,442,1/); // 23 % de 1920 libre abajo
  });
  it("oculta subtítulos que repiten el gancho, resalta una palabra y limpia llaves", () => {
    const lines = ass.split("\n").filter((l) => l.startsWith("Dialogue"));
    expect(lines.some((l) => l.includes(",Hook,") && l.includes("Deja de hacer esto"))).toBe(true);
    expect(lines.filter((l) => l.includes(",Sub,")).some((l) => l.includes("Deja de hacer esto"))).toBe(false);
    const sub = lines.find((l) => l.includes("Esto "))!;
    expect(sub).toContain("{\\c&H0768FE&}cambia{\\c&HFFFFFF&}"); // naranja FE6807 en BGR
    expect(sub).not.toContain("{x}");
    expect(lines.some((l) => l.includes("Se corta"))).toBe(false); // estaba dentro de un corte
  });
  it("recorre los tiempos y aplica los textos editados a mano", () => {
    const edited = buildAss({ plan: p, overrides: { ...EMPTY_OVERRIDES, titles: { "1": "Guárdalo ya" }, subtitles: { "1": "Texto corregido" } }, segs, kit });
    expect(edited).toContain("Guárdalo ya");
    expect(edited).toContain("Texto corregido");
    expect(ass).toContain("0:00:00.00,0:00:03.00,Hook"); // antes del corte: igual
    expect(ass).toMatch(/Dialogue: 1,0:00:16\.00,0:00:20\.00,Cta/); // 20–24 s menos 4 s cortados
  });
  it("la portada usa bloque sólido y resalta la palabra clave", () => {
    const c = buildCoverAss("Así le di voz a mi proyecto", "voz", kit);
    expect(c).toContain("Style: Cover,DM Serif Display,104");
    expect(c).toContain("{\\c&H0768FE&}voz");
  });
});

describe("comando de ffmpeg", () => {
  it("arma el filtro con cortes, acercamientos y subtítulos, y no usa shell", () => {
    const p = plan({ encuadres: [{ inicio_s: 0, fin_s: 4, plano: "cercano" }] });
    const segs = keepSegments(30, [{ a: 2, b: 5 }]);
    const { script, hasZoom } = buildFilterScript({ segs, plan: p, assPath: "/tmp/x/sub.ass", fontsDir: "/tmp/x/fonts" });
    expect(hasZoom).toBe(true);
    expect(script).toContain("[0:v]trim=start=0.000:end=2.000");
    expect(script).toContain("[0:a]atrim=start=5.000:end=30.000");
    expect(script).toContain("concat=n=2:v=1:a=1[vc][a]");
    expect(script).toContain("scale=w='trunc(1080*(");
    expect(script).toContain("subtitles=filename='/tmp/x/sub.ass':fontsdir='/tmp/x/fonts'[v]");
    expect(buildFilterScript({ segs, plan: plan(), assPath: "a", fontsDir: "b" }).hasZoom).toBe(false);
    expect(() => buildFilterScript({ segs: [], plan: p, assPath: "a", fontsDir: "b" })).toThrow(/vacío/);
    const args = editArgs("in.mp4", "[0:v]null[v];[0:a]anull[a]", "out.mp4");
    expect(args).toContain("-filter_complex");
    expect(args.at(-1)).toBe("out.mp4");
    expect(coverArgs("in.mp4", 3.5, "c.ass", "fonts", "c.png")).toContain("3.500");
  });
  it("escapa rutas con caracteres que ffmpeg interpreta", () => {
    expect(filterPath("C:\\tmp\\a b'c.ass")).toBe("'C\\:/tmp/a b'\\''c.ass'");
  });
});
