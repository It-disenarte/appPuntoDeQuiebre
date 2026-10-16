import { describe, expect, it } from "vitest";
import { BLOCKS, blockSchema, creatorStage, readBlockForm, type Answers } from "@/lib/brujula/content";
import { assembleManual, brujulaSkillOutput, manualContentSchema, mockBrujulaSkill } from "@/lib/brujula/manual";
import { pickDays, proposeSchedule, scheduleAnswersSchema, validateAdjusted, lightingAdvice } from "@/lib/brujula/schedule";
import { analyzeVoice, MOCK_TRANSCRIPT, voiceProfileSchema, wordCount } from "@/lib/brujula/voice";
import { matchesAudioSignature } from "@/lib/video-signature";


const ANSWERS: Answers = {
  quien: { displayName: "Ana Huerta", profession: "Agrónoma", story: "Quiero enseñar a cultivar en casa." },
  audiencia: { audience: "Gente que empieza un huerto", pain: "No saben por dónde empezar", feeling: "confianza" },
  percepcion: { traits: ["cercano", "divertido"], tone: "amigo", avoid: "Que suene a clase" },
  nicho: { niche: "Huertos urbanos", interests: "composta, riego, plagas, semillas", taboo: "política" },
  objetivo: { goal: "marca", hasOffer: "no", offer: "", followers: "350" },
  formatos: { formats: ["camara", "tutorial"], refs: "@huertofacil" },
};

const form = (entries: [string, string][]) => {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
};

describe("formulario por bloques", () => {
  it("tiene 6 bloques con campos y opciones definidos", () => {
    expect(BLOCKS).toHaveLength(6);
    for (const b of BLOCKS) expect(b.fields.length).toBeGreaterThan(0);
  });
  it("valida requeridos, opciones y máximo de elecciones", () => {
    const block = BLOCKS.find((b) => b.id === "percepcion")!;
    const bad = blockSchema(block).safeParse(readBlockForm(block, form([["traits", "cercano"], ["traits", "experto"], ["traits", "divertido"], ["traits", "directo"], ["tone", "amigo"]])));
    expect(bad.success).toBe(false);
    const fake = blockSchema(block).safeParse(readBlockForm(block, form([["traits", "inventado"], ["tone", "amigo"]])));
    expect(fake.success).toBe(false);
    const ok = blockSchema(block).safeParse(readBlockForm(block, form([["traits", "cercano"], ["tone", "amigo"]])));
    expect(ok.success).toBe(true);
  });
  it("el número de seguidores solo acepta dígitos", () => {
    const block = BLOCKS.find((b) => b.id === "objetivo")!;
    const mk = (followers: string) => blockSchema(block).safeParse(readBlockForm(block, form([["goal", "marca"], ["hasOffer", "no"], ["followers", followers]])));
    expect(mk("0").success).toBe(true);
    expect(mk("12a").success).toBe(false);
    expect(mk("-5").success).toBe(false);
  });
  it("calcula la etapa del creador", () => {
    expect(creatorStage(350, "no")).toBe("arranque");
    expect(creatorStage(1000, "no")).toBe("crecimiento");
    expect(creatorStage(20000, "no")).toBe("monetizacion");
    expect(creatorStage(2000, "si")).toBe("monetizacion");
    expect(creatorStage(200, "si")).toBe("arranque");
  });
});

describe("horario", () => {
  it("elige días separados y un respaldo", () => {
    const { main, backup } = pickDays(["lun", "mar", "mie", "jue", "vie"]);
    expect(main).toEqual(["lun", "jue"]);
    expect(backup).not.toBeNull();
    expect(main).not.toContain(backup);
  });
  it("sin días suficientes lanza error y el esquema exige al menos 2", () => {
    expect(() => pickDays(["lun"])).toThrow();
    expect(scheduleAnswersSchema.safeParse({ days: ["lun"], moment: "noche", duration: "120", place: "casa", light: "natural" }).success).toBe(false);
  });
  it("propone 2 bloques principales + 1 de respaldo y recomienda aro de luz de noche sin luz", () => {
    const p = proposeSchedule({ days: ["mar", "jue", "sab"], moment: "noche", duration: "120", place: "casa", light: "ninguna" });
    expect(p.blocks.filter((b) => b.kind === "principal")).toHaveLength(2);
    expect(p.blocks.filter((b) => b.kind === "respaldo")).toHaveLength(1);
    expect(p.blocks[0]!.start).toBe("19:30");
    expect(p.lightingAdvice).toMatch(/aro de luz/);
    expect(p.reasons.length).toBeGreaterThan(1);
  });
  it("con solo 2 días no hay respaldo y lo avisa", () => {
    const p = proposeSchedule({ days: ["mar", "jue"], moment: "manana", duration: "60", place: "casa", light: "natural" });
    expect(p.blocks).toHaveLength(2);
    expect(p.reasons.join(" ")).toMatch(/respaldo/);
  });
  it("valida ajustes: días distintos y 2 principales", () => {
    const p = proposeSchedule({ days: ["lun", "mar", "mie", "jue"], moment: "tarde", duration: "120", place: "casa", light: "aro" });
    expect(validateAdjusted(p.blocks)).toBeNull();
    expect(validateAdjusted([p.blocks[0]!, { ...p.blocks[1]!, day: p.blocks[0]!.day }])).toMatch(/distinto/);
    expect(validateAdjusted([p.blocks[0]!, { ...p.blocks[1]!, kind: "respaldo" }])).toMatch(/2 bloques principales/);
  });
  it("no recomienda aro de luz cuando ya tiene uno", () => {
    expect(lightingAdvice({ moment: "noche", light: "aro", place: "casa" })).toBeNull();
  });
});

describe("perfil de voz", () => {
  it("analiza vocabulario, muletillas y ritmo", () => {
    const p = analyzeVoice(MOCK_TRANSCRIPT, 120);
    expect(voiceProfileSchema.safeParse(p).success).toBe(true);
    expect(p.fillers.some((f) => f.word === "la verdad")).toBe(true);
    expect(p.pace.wpm).toBe(Math.round(wordCount(MOCK_TRANSCRIPT) / 2));
    expect(["Pausado", "Natural", "Ágil"]).toContain(p.pace.label);
    expect(p.vocabulary.length).toBeGreaterThan(0);
  });
  it("sin duración no mide el ritmo", () => {
    const p = analyzeVoice(MOCK_TRANSCRIPT, null);
    expect(p.pace.wpm).toBeNull();
  });
});

describe("manual de identidad", () => {
  it("la skill de prueba respeta el esquema de salida", () => {
    const out = mockBrujulaSkill(ANSWERS);
    expect(brujulaSkillOutput.safeParse(out).success).toBe(true);
    expect(out.pillars).toHaveLength(3);
    expect(out.pillars[0]!.name).toBe("Composta");
    expect(out.palette.name).toBe("Tierra cálida");
    expect(out.tone.avoid.join(" ")).toMatch(/política/);
  });
  it("completa pilares si hay pocos intereses", () => {
    const out = mockBrujulaSkill({ ...ANSWERS, nicho: { niche: "Cocina", interests: "tacos", taboo: "" } });
    expect(out.pillars).toHaveLength(3);
  });
  it("arma el manual y marca qué falta", () => {
    const m = assembleManual({ answers: ANSWERS, creative: mockBrujulaSkill(ANSWERS), voice: null, schedule: null });
    expect(manualContentSchema.safeParse(m).success).toBe(true);
    expect(m.complete).toEqual({ brujula: true, voz: false, horario: false });
    expect(m.stage.id).toBe("arranque");
    const full = assembleManual({
      answers: ANSWERS,
      creative: mockBrujulaSkill(ANSWERS),
      voice: { profile: analyzeVoice(MOCK_TRANSCRIPT, 100), mock: true },
      schedule: proposeSchedule({ days: ["mar", "jue", "sab"], moment: "tarde", duration: "120", place: "casa", light: "natural" }),
    });
    expect(full.complete).toEqual({ brujula: true, voz: true, horario: true });
    expect(full.voiceIsMock).toBe(true);
  });
  it("genera un PDF válido", async () => {
    const { buildManualPdf } = await import("@/lib/brujula/pdf");
    const m = assembleManual({
      answers: ANSWERS,
      creative: mockBrujulaSkill(ANSWERS),
      voice: { profile: analyzeVoice(MOCK_TRANSCRIPT, 100), mock: false },
      schedule: proposeSchedule({ days: ["mar", "jue", "sab"], moment: "noche", duration: "120", place: "casa", light: "ninguna" }),
    });
    const bytes = await buildManualPdf(m, "Ana Huerta");
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(5000);
  });
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
