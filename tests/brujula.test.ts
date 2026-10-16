import { describe, expect, it } from "vitest";
import { quickSchema, stepDone, STORY_STEPS, storyProgress, storySchema, wordCount, type Quick, type Story } from "@/lib/brujula/content";
import { buildSchedule, scheduleAnswersSchema, type ScheduleAnswers } from "@/lib/brujula/schedule";
import { analyzeVoice, MOCK_STORY } from "@/lib/brujula/voice";
import { extractJson } from "@/lib/skills";
import { buildMuestraVoz, mockApplyAdjustment, mockBrujulaV2, mockPerfilVozV1, type BrujulaInput } from "@/lib/skills/mock";
import { brujulaV2Output, horarioV1Output, MANUAL_SECTIONS, perfilVozV1Output } from "@/lib/skills/schemas";
import { matchesAudioSignature } from "@/lib/video-signature";

const day = (dia: ScheduleAnswers["dias"][number]["dia"], momentos: ScheduleAnswers["dias"][number]["momentos"], duracion_min: ScheduleAnswers["dias"][number]["duracion_min"], a_veces_no = false) => ({ dia, momentos, duracion_min, a_veces_no });

const BLOMBITO: ScheduleAnswers = {
  dias: [day("M", ["noche"], 60), day("J", ["noche"], 60), day("D", ["manana"], 120, true)],
  lugar: ["casa", "trabajo", "exteriores", "varia"],
  luz: ["natural", "aro", "lampara"],
};

describe("horario-v1 (reglas de la skill)", () => {
  it("reproduce el ejemplo de @blombito: 2 fijos, domingo como día extra, 2 h + 2 h", () => {
    const r = buildSchedule(BLOMBITO, { mejorHoraPublicar: "18:00" });
    expect(horarioV1Output.safeParse(r).success).toBe(true);
    const fijos = r.bloques.filter((b) => b.tipo === "fijo");
    expect(fijos.map((b) => [b.dia, b.inicio, b.fin])).toEqual([["M", "19:00", "20:00"], ["J", "19:00", "20:00"]]);
    const respaldo = r.bloques.find((b) => b.tipo === "respaldo")!;
    expect(respaldo.dia).toBe("D");
    expect(respaldo.inicio).toBe("10:00"); // mañana de fin de semana a las 10:00 (decisión 4b)
    expect(respaldo.fin).toBe("12:00");
    expect(r.horas_semana).toBe(2);
    expect(r.horas_con_extra).toBe(4);
    expect(r.sugerencia).toMatch(/suman 2 horas/);
    expect(r.publicar).toMatchObject({ hora: "18:00" });
    expect(r.recordatorios.some((x) => x.cuando === "lunes 20:00")).toBe(true);
    expect(r.recordatorios.some((x) => x.cuando === "martes 18:00")).toBe(true);
    expect(r.consejos.length).toBeGreaterThanOrEqual(2);
    expect(r.consejos.length).toBeLessThanOrEqual(3);
  });
  it("la mañana arranca a las 08:00 entre semana y a las 10:00 en fin de semana", () => {
    const r = buildSchedule({ dias: [day("L", ["manana"], 60), day("J", ["manana"], 60), day("S", ["manana"], 60, true)], lugar: ["casa"], luz: ["natural"] });
    expect(r.bloques.filter((b) => b.tipo === "fijo").map((b) => b.inicio)).toEqual(["08:00", "08:00"]);
    expect(r.bloques.find((b) => b.tipo === "respaldo")!.inicio).toBe("10:00");
  });
  it("un día con 'a veces no puedo' nunca es fijo", () => {
    const r = buildSchedule({ dias: [day("L", ["tarde"], 120), day("X", ["tarde"], 120, true), day("V", ["tarde"], 120)], lugar: ["casa"], luz: ["natural"] });
    const fijos = r.bloques.filter((b) => b.tipo === "fijo").map((b) => b.dia);
    expect(fijos).toEqual(["L", "V"]);
    expect(r.bloques.find((b) => b.tipo === "respaldo")!.dia).toBe("X");
  });
  it("prefiere entre semana y días no seguidos", () => {
    const r = buildSchedule({ dias: [day("L", ["tarde"], 90), day("M", ["tarde"], 90), day("X", ["tarde"], 90), day("S", ["tarde"], 90)], lugar: ["casa"], luz: ["natural"] });
    const fijos = r.bloques.filter((b) => b.tipo === "fijo").map((b) => b.dia);
    expect(fijos).not.toContain("S");
    expect(fijos).toEqual(["L", "X"]);
  });
  it("suma días fijos si no llegan a 3 horas y el respaldo queda flotante", () => {
    const r = buildSchedule({ dias: [day("M", ["tarde"], 60), day("J", ["tarde"], 60), day("S", ["manana"], 60)], lugar: ["casa"], luz: ["natural"] });
    expect(r.bloques.filter((b) => b.tipo === "fijo")).toHaveLength(3);
    expect(r.horas_semana).toBe(3);
    const respaldo = r.bloques.find((b) => b.tipo === "respaldo")!;
    expect(respaldo.flotante).toBe(true);
    expect(respaldo.dia).toBeNull();
  });
  it("si el aviso del día anterior cae dentro de un bloque, se manda al terminarlo", () => {
    const r = buildSchedule({ dias: [day("M", ["noche"], 90), day("X", ["noche"], 90)], lugar: ["casa"], luz: ["aro"] });
    const aviso = r.recordatorios.find((x) => x.cuando === "martes 20:30");
    expect(aviso?.texto).toMatch(/Mañana repites a las 19:00/);
  });
  it("recomienda aro de luz si graba de noche sin luz", () => {
    const r = buildSchedule({ dias: [day("M", ["noche"], 120), day("J", ["noche"], 120)], lugar: ["casa"], luz: ["ninguna"] });
    expect(r.consejos.join(" ")).toMatch(/aro de luz/);
  });
  it("usa 18:00 si no hay mejor hora de publicación", () => {
    expect(buildSchedule(BLOMBITO).publicar.hora).toBe("18:00");
  });
  it("valida las respuestas: mínimo 2 días, sin repetir, con momento", () => {
    expect(scheduleAnswersSchema.safeParse({ ...BLOMBITO, dias: [day("M", ["noche"], 60)] }).success).toBe(false);
    expect(scheduleAnswersSchema.safeParse({ ...BLOMBITO, dias: [day("M", ["noche"], 60), day("M", ["tarde"], 60)] }).success).toBe(false);
    expect(scheduleAnswersSchema.safeParse({ ...BLOMBITO, dias: [day("M", [], 60), day("J", ["noche"], 60)] }).success).toBe(false);
  });
});

const QUICK: Quick = { redes: ["instagram", "tiktok"], formatos: ["frente_a_camara", "en_vivo"], tono: ["inspiradora", "autentica"], referentes: ["@uno", "@dos", "@tres"] };
const STORY: Story = {
  steps: {
    calentamiento: { text: MOCK_STORY.calentamiento, source: "texto", seconds: null, mock: false },
    por_que_empezaste: { text: MOCK_STORY.por_que_empezaste, source: "texto", seconds: null, mock: false },
    que_te_molesta: { text: MOCK_STORY.que_te_molesta, source: "texto", seconds: null, mock: false },
    mayor_orgullo: { text: MOCK_STORY.mayor_orgullo, source: "texto", seconds: null, mock: false },
    a_quien_le_hablas: { text: MOCK_STORY.a_quien_le_hablas, source: "texto", seconds: null, mock: false },
    historia: { text: MOCK_STORY.historia, source: "texto", seconds: null, mock: false },
  },
  storyChoice: "algo_salio_mal",
  sell: { mode: "hoy", text: "Asesorías de huerto" },
};
const input = (over: Partial<BrujulaInput> = {}): BrujulaInput => ({
  creador_id: "u1",
  nombre: "Ana",
  auditoria: { modo: "sin_contenido" },
  respuestas_tarjetas: [],
  muestra_voz: buildMuestraVoz(STORY),
  elecciones_rapidas: QUICK,
  kit_visual: null,
  ...over,
});

describe("alta: Tu historia y elecciones rápidas", () => {
  it("tiene los 7 pasos de la skill con sus mínimos", () => {
    expect(STORY_STEPS).toHaveLength(7);
    expect(STORY_STEPS.find((s) => s.id === "calentamiento")).toMatchObject({ minSeconds: 30, minWords: 50 });
    expect(STORY_STEPS.find((s) => s.id === "historia")).toMatchObject({ minSeconds: 120, minWords: 250 });
  });
  it("avanza el progreso con pasos respondidos o saltados", () => {
    expect(storyProgress(null)).toMatchObject({ done: 0, complete: false, nextStep: "calentamiento" });
    const partial: Story = { steps: { calentamiento: { skipped: true }, por_que_empezaste: { text: "x", source: "texto", seconds: null, mock: false } } };
    expect(stepDone(partial, "calentamiento")).toBe(true);
    expect(storyProgress(partial).nextStep).toBe("que_te_molesta");
    expect(storyProgress(STORY).complete).toBe(true);
  });
  it("las respuestas de ejemplo cumplen los mínimos de palabras", () => {
    for (const s of STORY_STEPS.filter((x) => x.kind === "voz")) expect(wordCount(MOCK_STORY[s.id as keyof typeof MOCK_STORY])).toBeGreaterThanOrEqual(s.minWords);
  });
  it("valida elecciones rápidas: ≥3 referentes, tono máximo 3", () => {
    expect(quickSchema.safeParse(QUICK).success).toBe(true);
    expect(quickSchema.safeParse({ ...QUICK, referentes: ["@uno", "@dos"] }).success).toBe(false);
    expect(quickSchema.safeParse({ ...QUICK, tono: ["inspiradora", "autentica", "energetica", "cercana"] }).success).toBe(false);
    expect(quickSchema.safeParse({ ...QUICK, redes: ["myspace"] }).success).toBe(false);
    expect(quickSchema.safeParse({ ...QUICK, referentes: ["@uno", " ", "@dos", "", "@tres"] }).success).toBe(true);
  });
  it("lo guardado se valida al leer", () => {
    expect(storySchema.safeParse(STORY).success).toBe(true);
    expect(storySchema.safeParse({ steps: { calentamiento: { text: 5 } } }).success).toBe(false);
  });
  it("arma la muestra_voz con los nombres de campo de la skill", () => {
    const m = buildMuestraVoz({ ...STORY, steps: { ...STORY.steps, mayor_orgullo: { skipped: true } } });
    expect(Object.keys(m)).toEqual(["calentamiento", "por_que_empezaste", "que_te_molesta", "mayor_orgullo", "a_quien_le_hablas", "historia", "que_vendes", "preguntas_saltadas"]);
    expect(m.preguntas_saltadas).toEqual(["mayor_orgullo"]);
    expect(m.historia.eleccion).toBe("algo_salio_mal");
    expect(m.que_vendes).toMatch(/^sí, hoy/);
  });
});

describe("skills de prueba respetan el esquema real", () => {
  it("brujula-v2: salida válida y reglas básicas", () => {
    const out = mockBrujulaV2(input());
    expect(brujulaV2Output.safeParse(out).success).toBe(true);
    expect(out.skill_version).toBe("brujula-v2");
    expect(out.pilares.some((p) => p.categoria_dominante === "nicho")).toBe(true);
    expect(out.pilares.some((p) => p.categoria_dominante === "conversion")).toBe(true); // vende hoy
    expect(out.lives.hace_lives).toBe(true); // eligió "en vivo"
    expect(out.puente).toBeNull(); // sin auditoría
    expect(out.kit_visual_ref).toBe("kit-visual-v1");
    expect(out.palabras_si.length).toBeGreaterThanOrEqual(5);
  });
  it("tolera lo que la IA real suele devolver: kit_visual_ref null y arreglos omitidos", () => {
    const base = mockBrujulaV2(input()) as Record<string, unknown>;
    const out = brujulaV2Output.safeParse({ ...base, kit_visual_ref: null, datos_faltantes: undefined });
    expect(out.success).toBe(true);
    const voz = mockPerfilVozV1({ creador_id: "u1", muestra_voz: buildMuestraVoz(STORY), brujula: { tono: mockBrujulaV2(input()).tono, palabras_si: [], palabras_no: [] } }, null) as Record<string, unknown>;
    expect(perfilVozV1Output.safeParse({ ...voz, muletillas: undefined, frases_firma: undefined, preferencias_aprendidas: undefined }).success).toBe(true);
  });
  it("sin vender hoy no hay pilar de conversión", () => {
    const out = mockBrujulaV2(input({ muestra_voz: { ...buildMuestraVoz(STORY), que_vendes: "más adelante: conferencias" } }));
    expect(out.pilares.some((p) => p.categoria_dominante === "conversion")).toBe(false);
    expect(out.vision.despues).toMatch(/conferencias/);
  });
  it("tolera pasos saltados", () => {
    const out = mockBrujulaV2(input({ muestra_voz: { ...buildMuestraVoz({ steps: {} }), preguntas_saltadas: ["calentamiento"] } }));
    expect(brujulaV2Output.safeParse(out).success).toBe(true);
  });
  it("un ajuste toca solo la sección pedida", () => {
    const base = mockBrujulaV2(input());
    const next = mockApplyAdjustment(base, "tono", "más cercano");
    expect(next.tono.descripcion).toMatch(/Ajuste pedido: más cercano/);
    expect(next.nicho).toEqual(base.nicho);
    expect(next.pilares).toEqual(base.pilares);
  });
  it("perfil-voz-v1: salida válida con evidencia en la muestra", () => {
    const brujula = mockBrujulaV2(input());
    const out = mockPerfilVozV1({ creador_id: "u1", muestra_voz: buildMuestraVoz(STORY), brujula: { tono: brujula.tono, palabras_si: brujula.palabras_si, palabras_no: brujula.palabras_no } }, null);
    expect(perfilVozV1Output.safeParse(out).success).toBe(true);
    const corpus = Object.values(MOCK_STORY).join(" ").toLowerCase();
    for (const w of out.palabras_frecuentes) expect(corpus).toContain(w);
    for (const m of out.muletillas) expect(corpus).toContain(m.texto);
  });
  it("las secciones del manual cubren todos los campos de la skill", () => {
    const fields = MANUAL_SECTIONS.flatMap((s) => s.fields as readonly string[]);
    for (const f of ["nicho", "publico", "propuesta_valor", "frase_de_marca", "pilares", "tono", "palabras_si", "palabras_no", "postura", "puente", "vision", "estilo_grabacion"]) expect(fields).toContain(f);
  });
});

describe("ejecutor de skills", () => {
  it("extrae el JSON aunque venga envuelto", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Aquí está: {"a":{"b":2}} listo')).toEqual({ a: { b: 2 } });
    expect(() => extractJson("sin json")).toThrow();
  });
});

describe("análisis de voz", () => {
  it("encuentra muletillas y vocabulario en la muestra", () => {
    const s = analyzeVoice(Object.values(MOCK_STORY).join(" "), 600);
    expect(s.fillers.some((f) => f.word === "la verdad")).toBe(true);
    expect(s.vocabulary.length).toBeGreaterThan(3);
    expect(s.wpm).toBeGreaterThan(0);
  });
  it("sin duración no mide el ritmo", () => {
    expect(analyzeVoice(MOCK_STORY.historia, null).wpm).toBeNull();
  });
});

describe("PDF de la brújula", () => {
  it("genera un PDF válido con el esquema real", async () => {
    const { buildManualPdf } = await import("@/lib/brujula/pdf");
    const manual = mockBrujulaV2(input());
    const voice = mockPerfilVozV1({ creador_id: "u1", muestra_voz: buildMuestraVoz(STORY), brujula: { tono: manual.tono, palabras_si: manual.palabras_si, palabras_no: manual.palabras_no } }, 300);
    const bytes = await buildManualPdf({ name: "Ana Huerta", manual, voice, schedule: buildSchedule(BLOMBITO), mock: true });
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(5000);
  }, 30_000);
  it("también sin voz ni horario", async () => {
    const { buildManualPdf } = await import("@/lib/brujula/pdf");
    const bytes = await buildManualPdf({ name: "Ana", manual: mockBrujulaV2(input()), voice: null, schedule: null, mock: false });
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  }, 30_000);
});

describe("firma de audio", () => {
  const b = (...n: number[]) => Uint8Array.from([...n, ...new Array(Math.max(0, 12 - n.length)).fill(0)]);
  it("acepta WebM, Ogg y M4A reales", () => {
    expect(matchesAudioSignature(b(0x1a, 0x45, 0xdf, 0xa3), "audio/webm")).toBe(true);
    expect(matchesAudioSignature(Uint8Array.from(Buffer.from("OggS\0\0\0\0\0\0\0\0", "latin1")), "audio/ogg")).toBe(true);
    expect(matchesAudioSignature(Uint8Array.from(Buffer.from("\0\0\0\x18ftypM4A \0\0\0\0", "latin1")), "audio/mp4")).toBe(true);
  });
  it("rechaza texto o HTML con tipo de audio", () => {
    expect(matchesAudioSignature(Uint8Array.from(Buffer.from("<html><script>", "latin1")), "audio/webm")).toBe(false);
    expect(matchesAudioSignature(Uint8Array.from(Buffer.from("<svg xmlns='x'>", "latin1")), "audio/mp4")).toBe(false);
    expect(matchesAudioSignature(b(0x1a, 0x45, 0xdf, 0xa3), "audio/wav")).toBe(false);
  });
});
