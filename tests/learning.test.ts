import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown, calls: [] as unknown[], output: {} as Record<string, unknown> }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/skills", () => ({
  runAprendizaje: async (_u: string, input: unknown) => {
    holder.calls.push(input);
    return { output: (await import("@/lib/skills/schemas")).aprendizajeV1Output.parse(holder.output), mock: false, skillVersion: "reglas-aprendizaje-v1" };
  },
}));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";

const voice = {
  skill_version: "perfil-voz-v1",
  formalidad: 3,
  energia: "media",
  ritmo: "pausado",
  estructura_tipica: ["gancho"],
  palabras_frecuentes: ["mira"],
  muletillas: [],
  frases_firma: [],
  como_aconseja: "con calma",
  humor: "suave",
  recursos: [],
  evitar: [],
  ejemplo: { generico: "a", en_su_voz: "b" },
  reglas_para_guiones: ["frases cortas"],
  preferencias_aprendidas: [{ cambia: "Frases largas", por: "Frases cortas", motivo: "Lo pidió el creador" }],
};

let counter = 0;
async function addPieces(n: number, planId: string, withVote: boolean) {
  for (let i = 0; i < n; i++) {
    await pdb.insert(schema.contentPieces).values({
      planId,
      userId,
      n: ++counter,
      day: "2026-10-20",
      publishTime: "18:00",
      kind: "video",
      category: "nicho",
      type: "probado",
      pillar: "P",
      topic: `Tema ${i}`,
      script: { gancho: i % 2 ? "¿Te ha pasado?" : "Mi planta murió", cuerpo: ["a"], cierre: "b", duracion_segundos: 30, nota_grabacion: "" },
      textsReview: withVote ? { modo: "aprendizaje", votos: { instagram: i % 3 === 0 ? "no" : "si" }, ganchoElegido: 0, edits: {} } : null,
    });
  }
}

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "apr@x.com", name: "Apr", passwordHash: "x" }).returning();
  userId = u!.id;
  await pdb.insert(schema.voiceProfiles).values({ userId, content: voice, skillVersion: "perfil-voz-v1" });
}, 30_000);

describe("tipo de gancho", () => {
  it("lo deduce del texto", async () => {
    const { hookKind } = await import("@/lib/learning/service");
    expect(hookKind("¿Te ha pasado que no avanzas?")).toBe("pregunta");
    expect(hookKind("El 80 % de las plantas muere por riego")).toBe("dato");
    expect(hookKind("Todos dicen que hay que regar diario")).toBe("creencia_contraria");
    expect(hookKind("Ayer a las 7 de la tarde me pasó algo")).toBe("escena");
    expect(hookKind("Mi jitomate murió por exceso de cariño")).toBe("confesion");
    expect(hookKind("Regar bien es un arte")).toBe("otro");
    expect(hookKind("")).toBe("otro");
  });
});

describe("aprendizaje del creador", () => {
  it("con pocas piezas no llama a la IA y lo explica con amabilidad", async () => {
    const [plan] = await pdb.insert(schema.weekPlans).values({ userId, weekStart: "2026-10-19", tier: "basico", stage: "arranque", mix: { viral: 50, nicho: 40, conversion: 10 }, skillVersion: "x" }).returning();
    await addPieces(3, plan!.id, true);
    const { runLearning, latestLearning } = await import("@/lib/learning/service");
    expect(await runLearning(userId)).toEqual({ ok: true });
    expect(holder.calls).toHaveLength(0);
    const l = await latestLearning(userId);
    expect(l?.result.suficiente_evidencia).toBe(false);
    expect(l?.result.para_el_creador).toMatch(/3 de 6/);
  });

  it("con suficientes piezas corre la skill, guarda las preferencias en su perfil y ajusta guiones y mezcla", async () => {
    const [plan] = await pdb.select().from(schema.weekPlans).where(eq(schema.weekPlans.userId, userId));
    await addPieces(4, plan!.id, true); // ya hay 7 con voto
    holder.output = {
      suficiente_evidencia: true,
      resumen: "Tus videos con pregunta se guardan más.",
      preferencias_nuevas: [{ cambia: "Abrir con un dato", por: "Abrir con una pregunta", motivo: "En 4 de 5 videos funcionó mejor" }],
      reglas_para_guiones: ["Abre con una pregunta"],
      ajuste_mezcla: { viral: -0.15, nicho: 0.2, conversion: 0.2, motivo: "Se guardan más" },
      para_el_creador: "Ya aprendí algo de cómo hablas.",
    };
    const { runLearning, latestLearning, learnedRules, learnedMix } = await import("@/lib/learning/service");
    expect(await runLearning(userId)).toEqual({ ok: true });
    expect(holder.calls).toHaveLength(1);
    const input = holder.calls[0] as { piezas: { tipo_gancho: string }[]; mezcla_actual: Record<string, number> };
    expect(input.piezas.length).toBeGreaterThanOrEqual(6);
    expect(input.mezcla_actual).toEqual({ viral: 0.5, nicho: 0.4, conversion: 0.1 });

    expect((await latestLearning(userId))?.result.suficiente_evidencia).toBe(true);
    expect(await learnedRules(userId)).toEqual(["Abre con una pregunta"]);

    // La preferencia quedó en el perfil de voz (marcada como aprendida) y la que ya había se conserva.
    const [row] = await pdb.select().from(schema.voiceProfiles).where(eq(schema.voiceProfiles.userId, userId));
    const prefs = (row!.content as { preferencias_aprendidas: { cambia: string; origen?: string }[] }).preferencias_aprendidas;
    expect(prefs.map((p) => p.cambia)).toEqual(["Abrir con un dato", "Frases largas"]);
    expect(prefs[0]!.origen).toBe("aprendizaje");

    // Aunque la IA pida más, la mezcla se mueve máximo 10 puntos y la conversión no pasa de 35 %.
    const base = { viral: 30, nicho: 40, conversion: 30 };
    const mix = await learnedMix(userId, base);
    expect(mix.viral + mix.nicho + mix.conversion).toBe(100);
    for (const c of ["viral", "nicho", "conversion"] as const) expect(Math.abs(mix[c] - base[c])).toBeLessThanOrEqual(10);
    expect(mix.conversion).toBeLessThanOrEqual(35);
  });

  it("olvidar lo aprendido borra las corridas y solo las preferencias que vinieron del aprendizaje", async () => {
    const { forgetLearning, latestLearning, learnedRules } = await import("@/lib/learning/service");
    await forgetLearning(userId);
    expect(await latestLearning(userId)).toBeNull();
    expect(await learnedRules(userId)).toEqual([]);
    const [row] = await pdb.select().from(schema.voiceProfiles).where(eq(schema.voiceProfiles.userId, userId));
    expect((row!.content as { preferencias_aprendidas: { cambia: string }[] }).preferencias_aprendidas.map((p) => p.cambia)).toEqual(["Frases largas"]);
  });
});
