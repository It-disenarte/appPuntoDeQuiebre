import { describe, expect, it } from "vitest";
import { mockHistorias, mockParrilla, mockTextos, STORY_LIBRARY, type HistoriasInput, type ParrillaInput, type TextosInput } from "@/lib/plan/mock";
import { addDays, adjustMix, allocate, categoryCounts, dowMon0, isoWeekNumber, mixFor, mondayOf, noBackToBack, planSlots, stageFor, targetWeek, textMode, todayIso } from "@/lib/plan/rules";
import { historiasV2Output, parrillaV1Output, textosV2Output } from "@/lib/skills/schemas";

describe("mezcla por etapa (guía de Luis)", () => {
  it("usa las mezclas de la guía", () => {
    expect(mixFor("arranque", true)).toEqual({ viral: 50, nicho: 40, conversion: 10 });
    expect(mixFor("crecimiento", true)).toEqual({ viral: 40, nicho: 40, conversion: 20 });
    expect(mixFor("monetizacion", true)).toEqual({ viral: 30, nicho: 40, conversion: 30 });
    expect(mixFor("arranque", false)).toEqual({ viral: 50, nicho: 50, conversion: 0 }); // sin oferta
    expect(mixFor("monetizacion", false).conversion).toBe(0);
  });
  it("calcula la etapa", () => {
    expect(stageFor({ accountAgeDays: 10, followers: 50_000 })).toBe("arranque"); // primeros 2 meses
    expect(stageFor({ accountAgeDays: 200, followers: 500 })).toBe("arranque");
    expect(stageFor({ accountAgeDays: 200, followers: 1_000 })).toBe("crecimiento");
    expect(stageFor({ accountAgeDays: 200, followers: 10_001 })).toBe("monetizacion");
    expect(stageFor({ accountAgeDays: 200, followers: null })).toBe("arranque");
  });
  it("reparte las piezas sin perder ninguna", () => {
    for (const mix of [mixFor("arranque", true), mixFor("crecimiento", true), mixFor("monetizacion", true), mixFor("arranque", false)]) {
      for (const n of [4, 5, 6, 7]) expect(Object.values(allocate(n, mix)).reduce((a, b) => a + b, 0)).toBe(n);
    }
    expect(allocate(6, { viral: 50, nicho: 50, conversion: 0 })).toEqual({ viral: 3, nicho: 3, conversion: 0 });
    expect(allocate(6, mixFor("arranque", true)).conversion).toBe(1);
  });
  it("el ajuste por aprendizaje se mueve máximo 10 puntos y la conversión no pasa de 35 %", () => {
    const base = mixFor("monetizacion", true);
    const out = adjustMix(base, { viral: 0, nicho: 0, conversion: 100 });
    expect(out.conversion).toBeLessThanOrEqual(35);
    expect(Math.abs(out.viral - base.viral)).toBeLessThanOrEqual(10);
    expect(out.viral + out.nicho + out.conversion).toBe(100);
  });
});

describe("fechas", () => {
  it("lunes y días de la semana", () => {
    expect(mondayOf("2026-10-21")).toBe("2026-10-19"); // miércoles → lunes
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
    expect(dowMon0("2026-10-25")).toBe(6); // domingo
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
  it("arma la semana actual de lunes a miércoles y la siguiente después", () => {
    expect(targetWeek("2026-10-19")).toBe("2026-10-19");
    expect(targetWeek("2026-10-21")).toBe("2026-10-19");
    expect(targetWeek("2026-10-22")).toBe("2026-10-26");
    expect(targetWeek("2026-10-25")).toBe("2026-10-26");
  });
  it("hoy se calcula en la zona de la Ciudad de México", () => {
    // 03:00 UTC del 20 de octubre sigue siendo el 19 en México (UTC-6).
    expect(todayIso(new Date("2026-10-20T03:00:00Z"))).toBe("2026-10-19");
    expect(isoWeekNumber("2026-10-19")).toBe(43);
  });
});

describe("patrón de la semana", () => {
  it("Básico: 4 videos (3 + variante) y 3 carruseles", () => {
    const s = planSlots({ plan: "basico", weekStart: "2026-10-19", mix: mixFor("arranque", true) });
    expect(s).toHaveLength(7);
    expect(s.filter((x) => x.kind === "video")).toHaveLength(4);
    expect(s.filter((x) => x.kind === "carrusel")).toHaveLength(3);
    expect(s.filter((x) => x.variantOf !== null)).toHaveLength(1);
  });
  it("Pro: 5 videos (4 + variante) y 2 carruseles", () => {
    const s = planSlots({ plan: "pro", weekStart: "2026-10-19", mix: mixFor("arranque", true) });
    expect(s.filter((x) => x.kind === "video")).toHaveLength(5);
    expect(s.filter((x) => x.kind === "carrusel")).toHaveLength(2);
  });
  it("máximo una prueba por semana y es la variante del domingo", () => {
    for (const plan of ["basico", "pro"] as const) {
      const s = planSlots({ plan, weekStart: "2026-10-19", mix: mixFor("crecimiento", true) });
      const tests = s.filter((x) => x.type === "prueba");
      expect(tests).toHaveLength(1);
      expect(tests[0]).toMatchObject({ dow: "D", kind: "video", day: "2026-10-25" });
      const base = s.find((x) => x.n === tests[0]!.variantOf)!;
      expect(base.kind).toBe("video");
      expect(base.category).toBe(tests[0]!.category); // hereda la categoría
    }
  });
  it("respeta la mezcla (sin contar la variante) y un día por pieza", () => {
    const s = planSlots({ plan: "basico", weekStart: "2026-10-19", mix: mixFor("arranque", true) });
    expect(categoryCounts(s)).toEqual({ viral: 3, nicho: 2, conversion: 1 });
    expect(new Set(s.map((x) => x.day)).size).toBe(7);
    const noOffer = planSlots({ plan: "basico", weekStart: "2026-10-19", mix: mixFor("arranque", false) });
    expect(categoryCounts(noOffer).conversion).toBe(0);
  });
  it("el viral va en videos y la conversión en carruseles", () => {
    const s = planSlots({ plan: "basico", weekStart: "2026-10-19", mix: mixFor("arranque", true) });
    expect(s.filter((x) => x.variantOf === null && x.category === "viral").every((x) => x.kind === "video")).toBe(true);
    expect(s.find((x) => x.category === "conversion" && x.variantOf === null)!.kind).toBe("carrusel");
  });
  it("alterna el tipo de prueba entre semanas", () => {
    const a = planSlots({ plan: "basico", weekStart: "2026-10-19", mix: mixFor("arranque", true) }).at(-1)!.testKind;
    const b = planSlots({ plan: "basico", weekStart: "2026-10-26", mix: mixFor("arranque", true) }).at(-1)!.testKind;
    expect(a).not.toBe(b);
  });
});

describe("modo de los textos", () => {
  it("aprendizaje las primeras 10 piezas y rápido después", () => {
    expect(textMode(3, [])).toBe("aprendizaje");
    expect(textMode(10, [false, false, true, false, false])).toBe("rapido");
  });
  it("si edita 3 de las últimas 5 vuelve a aprendizaje", () => {
    expect(textMode(12, [false, true, true, false, true])).toBe("aprendizaje");
  });
});

const brujula = {
  nicho: { principal: "Huertos urbanos" },
  pilares: [
    { nombre: "Empieza chiquito", descripcion: "Primeros pasos", categoria_dominante: "nicho", ideas_de_tema: ["La primera planta", "Qué necesitas", "Cuánto sol"] },
    { nombre: "Hojas amarillas", descripcion: "Errores reales", categoria_dominante: "viral", ideas_de_tema: ["Regar de más", "Semillas muertas"] },
    { nombre: "Del huerto a la mesa", descripcion: "Cocinar lo cosechado", categoria_dominante: "nicho", ideas_de_tema: ["Mi primera ensalada"] },
  ],
  palabras_si: ["huerto", "paso a paso", "maceta", "cosecha"],
  palabras_no: ["perfecto"],
  lives: { hace_lives: false },
};
const voz = { frases_firma: [], como_aconseja: "Directo", preferencias_aprendidas: [] };

describe("skills de la parrilla (versión de prueba)", () => {
  const slots = planSlots({ plan: "basico", weekStart: "2026-10-19", mix: mixFor("arranque", true) });
  const input: ParrillaInput = {
    creador_id: "u1",
    brujula,
    perfil_voz: voz,
    semana: slots.map((s) => ({ n: s.n, dia: s.day, formato: s.kind, categoria: s.category, tipo: s.type, variante_de: s.variantOf, prueba: s.testKind })),
    temas_recientes: ["La primera planta"],
    enfoque: null,
  };
  it("una pieza por espacio, con esquema válido y sin repetir pilar en días seguidos", () => {
    const out = mockParrilla(input);
    expect(parrillaV1Output.safeParse(out).success).toBe(true);
    expect(out.piezas.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (let i = 1; i < 6; i++) expect(out.piezas[i]!.pilar).not.toBe(out.piezas[i - 1]!.pilar);
    for (const p of out.piezas.slice(0, 6)) expect(p.tema).not.toBe("La primera planta"); // temas recientes
  });
  it("la variante repite tema y pilar, y trae su tarjeta de prueba", () => {
    const out = mockParrilla(input);
    const v = out.piezas.find((p) => p.n === 7)!;
    const base = out.piezas.find((p) => p.n === slots.find((s) => s.n === 7)!.variantOf)!;
    expect(v.tema).toBe(base.tema);
    expect(v.pilar).toBe(base.pilar);
    expect(v.tarjeta_prueba).toBeTruthy();
    expect(v.variante).toMatchObject({}); // gancho_b o angulo_b según la semana
  });
  it("el cierre sigue la categoría", () => {
    const out = mockParrilla(input);
    const viral = slots.find((s) => s.category === "viral" && s.kind === "video" && s.variantOf === null)!;
    expect((out.piezas.find((p) => p.n === viral.n)!.guion as { cierre: string }).cierre).toMatch(/Guárdalo|compártelo/);
  });
  it("textos solo para las redes que usa y con límites de largo", () => {
    const t: TextosInput = { creador_id: "u1", pieza: { tipo: "reel", guion: "Mi jitomate murió. Regué de más y aprendí a revisar la tierra con el dedo.", pilar: "Hojas amarillas", categoria: "viral", redes: ["instagram", "tiktok"] }, brujula, perfil_voz: voz, historial_hashtags: [], modo: "aprendizaje" };
    const out = mockTextos(t);
    expect(textosV2Output.safeParse(out).success).toBe(true);
    expect(out.ganchos).toHaveLength(3);
    for (const g of out.ganchos) expect(g.length).toBeLessThanOrEqual(125);
    expect(out.facebook).toBeUndefined(); // no usa Facebook
    expect(out.tiktok!.texto.length).toBeLessThanOrEqual(300);
    expect(out.instagram!.hashtags.length).toBeLessThanOrEqual(5);
  });
  it("ideas de historias: 7 días, sin repetir tipo seguido, ≥3 con sticker y un día de idea propia", () => {
    const h: HistoriasInput = {
      creador_id: "u1",
      brujula,
      perfil_voz: voz,
      horario: { bloques: [{ tipo: "fijo", dia: "M" }, { tipo: "fijo", dia: "J" }] },
      parrilla_semana: [{ dia: "L", tipo: "reel", tema: "x", publica: "18:00" }],
      historial: [],
      enfoque_semana: { temas: ["Cosecha"], tipos_apagados: [{ tipo: "Cuenta regresiva", hasta: "2026-11-30" }] },
    };
    const out = mockHistorias(h);
    expect(historiasV2Output.safeParse(out).success).toBe(true);
    expect(out.semana).toHaveLength(7);
    expect(out.semana.filter((d) => d.tipo === "idea_propia")).toHaveLength(1);
    const types = out.semana.filter((d) => d.tipo !== "idea_propia").map((d) => d.tipo);
    expect(noBackToBack(out.semana.map((d) => d.tipo))).toBe(true);
    expect(types.filter((t) => STORY_LIBRARY.find((l) => l.tipo === t)?.sticker).length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(out)).not.toContain("Cuenta regresiva"); // tipo apagado: ni como alternativa
    expect(out.semana.some((d) => d.tema_enfoque === "Cosecha")).toBe(true);
  });
});
