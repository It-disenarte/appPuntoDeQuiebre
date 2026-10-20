import { writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown, deleted: [] as string[] }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/storage", () => ({
  deleteObject: async (k: string) => void holder.deleted.push(k),
  getObject: async () => ({ body: new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])).body!, contentType: "video/mp4", contentLength: 8, contentRange: undefined, partial: false }),
  putObjectStream: async () => undefined,
  storageConfigured: () => true,
}));
vi.mock("@/lib/recording/ffmpeg", async (orig) => {
  const real = await orig<typeof import("@/lib/recording/ffmpeg")>();
  return { ...real, probeVideo: async () => ({ duration: 6, width: 1080 }), meanVolume: async () => -50, runFfmpeg: async (args: string[]) => void (await writeFile(args[args.length - 1]!, Buffer.alloc(10))) };
});

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";
let pieceId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.ANTHROPIC_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "rec@x.com", name: "Rec", passwordHash: "x" }).returning();
  userId = u!.id;
  await pdb.insert(schema.subscriptions).values({ userId, providerSubscriptionId: "sub_r", plan: "pro", status: "active" });
  const [plan] = await pdb.insert(schema.weekPlans).values({ userId, weekStart: "2026-10-19", tier: "pro", skillVersion: "t", stage: "arranque", mix: { viral: 50, nicho: 50, conversion: 0 } }).returning();
  const [p] = await pdb.insert(schema.contentPieces).values({ planId: plan!.id, userId, n: 1, day: "2026-10-20", publishTime: "08:00", kind: "video", category: "viral", type: "probado", pillar: "p", topic: "Un martes creando conmigo", script: { gancho: "Así empieza mi día creativo", cuerpo: ["a"], cierre: "Sígueme para más" } }).returning();
  pieceId = p!.id;
}, 30_000);

describe("reglas de la receta (por código)", () => {
  const kit = { titleFont: "DM Serif Display", textColor: "#FFFFFF", detailColor: "#FE6807" };
  const clips = [{ id: "c1", seconds: 6, hasVoice: false }, { id: "c2", seconds: 4, hasVoice: false }];

  it("fija el primer y el último paso, agrega cómo importar la fuente, descarta clips inventados y respeta el máximo", async () => {
    const { recipeSchema, shapeRecipe, FIRST_STEP, LAST_STEP, FONT_STEP, MAX_STEPS } = await import("@/lib/edit/recipe-schemas");
    const many = Array.from({ length: 14 }, (_, i) => ({ numero: i, clip_id: i % 2 ? "c1" : "c2", desde_s: 0, hasta_s: 2, accion: `Dividir la toma número ${i} y dejar solo lo mejor de la escena actual con mucho cuidado de que quede bien`, texto_pantalla: i === 0 ? "Este es un texto en pantalla demasiado largo para caber" : null }));
    const r = recipeSchema.parse({ pasos: [{ numero: 1, clip_id: "c1", desde_s: 0, hasta_s: 2, accion: "Importa todo" }, { numero: 2, clip_id: "zzz", desde_s: 0, hasta_s: 1, accion: "Usa un clip inventado" }, { numero: 3, clip_id: "c2", desde_s: 3, hasta_s: 90, accion: "Exporta en 4K" }, ...many], clips_descartados: [{ clip_id: "c1", porque: "borrosa" }, { clip_id: "nope", porque: "x" }], estilo_textos: { fuente: "Comic Sans" } });
    const s = shapeRecipe(r, clips, kit);
    expect(s.pasos).toHaveLength(MAX_STEPS);
    expect(s.pasos[0]!.accion).toBe(FIRST_STEP);
    expect(s.pasos[1]!.accion).toBe(FONT_STEP); // hay textos en pantalla: se explica cómo importar la fuente
    expect(s.pasos.at(-1)!.accion).toBe(LAST_STEP);
    expect(s.pasos.map((p) => p.numero)).toEqual(Array.from({ length: MAX_STEPS }, (_, i) => i + 1));
    expect(s.pasos.some((p) => p.clip_id === "zzz")).toBe(false);
    expect(s.pasos.every((p) => p.accion.split(/\s+/).length <= 18)).toBe(true);
    expect(s.pasos.find((p) => p.texto_pantalla)!.texto_pantalla!.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(s.pasos.filter((p) => p.clip_id === "c2").every((p) => p.hasta_s <= 4)).toBe(true); // dentro de la duración de la toma
    expect(s.estilo_textos.fuente).toBe("DM Serif Display"); // la fuente del kit, no la que propuso la IA
    expect(s.clips_descartados).toEqual([{ clip_id: "c1", porque: "borrosa" }]);
    expect(s.subtitulos).toBeNull(); // ninguna toma trae voz
    expect(shapeRecipe(r, [{ id: "c1", seconds: 6, hasVoice: true }, clips[1]!], kit).subtitulos).toMatch(/Subtítulos automáticos/);
  });
});

describe("receta para CapCut (sin IA: receta de ejemplo)", () => {
  it("es solo Pro y pide al menos una toma", async () => {
    const svc = await import("@/lib/edit/recipe");
    expect((await svc.requestRecipe(userId, pieceId)).ok).toBe(false);
    expect((await svc.canAddClip(userId, pieceId)).ok).toBe(true);
    const [b] = await pdb.insert(schema.users).values({ email: "basic@x.com", name: "B", passwordHash: "x" }).returning();
    await pdb.insert(schema.subscriptions).values({ userId: b!.id, providerSubscriptionId: "sub_bb", plan: "basico", status: "active" });
    expect((await svc.canAddClip(b!.id, pieceId)).ok).toBe(false);
  }, 30_000);

  it("limita a 8 tomas, las ordena y las quita", async () => {
    const svc = await import("@/lib/edit/recipe");
    for (let i = 0; i < 3; i++) await svc.commitClip({ userId, pieceId, key: `clip-${i}`, contentType: "video/mp4", bytes: 10, seconds: 4 + i });
    let list = await svc.listClips(userId, pieceId);
    expect(list.map((c) => c.position)).toEqual([0, 1, 2]);
    await svc.moveClip(userId, list[2]!.id, "up");
    list = await svc.listClips(userId, pieceId);
    expect(list.map((c) => c.objectKey)).toEqual(["clip-0", "clip-2", "clip-1"]);
    await svc.removeClip(userId, list[0]!.id);
    expect(holder.deleted).toContain("clip-0");
    list = await svc.listClips(userId, pieceId);
    expect(list.map((c) => c.position)).toEqual([0, 1]);
    for (let i = 3; i < 9; i++) await svc.commitClip({ userId, pieceId, key: `clip-${i}`, contentType: "video/mp4", bytes: 10, seconds: 3 });
    expect((await svc.canAddClip(userId, pieceId)).ok).toBe(false); // ya hay 8
  }, 30_000);

  it("arma la receta, deja el primer y último paso fijos y permite 3 ajustes", async () => {
    const svc = await import("@/lib/edit/recipe");
    expect((await svc.requestRecipe(userId, pieceId)).ok).toBe(true);
    expect((await svc.requestRecipe(userId, pieceId)).ok).toBe(false); // ya está en proceso
    expect((await pdb.select().from(schema.jobs)).some((j) => j.kind === "edicion.receta")).toBe(true);
    const row = (await svc.getRecipe(userId, pieceId))!;
    await svc.runRecipe(userId, row.id);
    const done = (await svc.getRecipe(userId, pieceId))!;
    expect(done.status).toBe("lista");
    expect(done.mock).toBe(true);
    const r = svc.parseRecipe(done.result)!;
    expect(r.pasos[0]!.accion).toMatch(/proyecto 9:16/);
    expect(r.pasos.at(-1)!.accion).toBe("Exporta en 1080p");
    expect(r.pasos.length).toBeLessThanOrEqual(10);
    expect(r.estilo_textos.fuente).toBe("Poppins"); // sin kit: tipografía neutra
    for (let i = 1; i <= 3; i++) {
      expect((await svc.requestRecipeAdjust(userId, pieceId, `cambia esto ${i}`)).ok).toBe(true);
      await svc.runRecipe(userId, row.id);
    }
    const over = await svc.requestRecipeAdjust(userId, pieceId, "otro más");
    expect(over.ok).toBe(false);
    expect(!over.ok && over.error).toMatch(/3 ajustes/);
  }, 60_000);
});
