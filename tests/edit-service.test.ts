import { writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown, deleted: [] as string[], uploaded: [] as string[], calls: [] as string[][], fail: false }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/storage", () => ({
  deleteObject: async (k: string) => void holder.deleted.push(k),
  getObject: async () => ({ body: new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])).body!, contentType: "video/mp4", contentLength: 8, contentRange: undefined, partial: false }),
  putObjectStream: async (k: string, body: AsyncIterable<unknown>) => {
    for await (const _ of body) void _;
    holder.uploaded.push(k);
  },
  storageConfigured: () => true,
}));
vi.mock("@/lib/recording/ffmpeg", async (orig) => {
  const real = await orig<typeof import("@/lib/recording/ffmpeg")>();
  return {
    ...real,
    probeVideo: async () => ({ duration: 30, width: 1080 }),
    runFfmpeg: async (args: string[]) => {
      holder.calls.push(args);
      if (holder.fail) throw new Error("ffmpeg terminó con error 1: Invalid filtergraph");
      await writeFile(args[args.length - 1]!, Buffer.alloc(1024, 2));
    },
  };
});

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";
let basicId = "";
let pieceId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "pro@x.com", name: "Pro", passwordHash: "x" }).returning();
  const [b] = await pdb.insert(schema.users).values({ email: "basico@x.com", name: "Basico", passwordHash: "x" }).returning();
  userId = u!.id;
  basicId = b!.id;
  await pdb.insert(schema.subscriptions).values([{ userId, providerSubscriptionId: "sub_p", plan: "pro", status: "active" }, { userId: basicId, providerSubscriptionId: "sub_b", plan: "basico", status: "active" }]);
  const [plan] = await pdb.insert(schema.weekPlans).values({ userId, weekStart: "2026-10-19", tier: "pro", skillVersion: "t", stage: "arranque", mix: { viral: 50, nicho: 50, conversion: 0 } }).returning();
  const [p] = await pdb
    .insert(schema.contentPieces)
    .values({ planId: plan!.id, userId, n: 1, day: "2026-10-20", publishTime: "08:00", kind: "video", category: "viral", type: "probado", pillar: "Huerto", topic: "Cómo empezar un huerto en casa", script: { gancho: "Si tus plantas se mueren haces esto mal", cuerpo: ["Riega solo cuando la tierra está seca", "Busca luz de ventana"], cierre: "Guárdalo para tu primer huerto", duracion_segundos: 30 } })
    .returning();
  pieceId = p!.id;
  await pdb.insert(schema.videoExports).values({ userId, pieceId, status: "lista", objectKey: "exp-1", bytes: 1000, seconds: 30 });
}, 30_000);

describe("edición automática (sin IA: edición de ejemplo por reglas)", () => {
  it("es solo del plan Pro y exige el video completo", async () => {
    const svc = await import("@/lib/edit/service");
    const q = await svc.editQuota(basicId);
    expect(q.allowed).toBe(false);
    expect((await svc.requestEdit(basicId, pieceId)).ok).toBe(false);
    await pdb.update(schema.videoExports).set({ status: "procesando" }).where(eq(schema.videoExports.pieceId, pieceId));
    const noVideo = await svc.requestEdit(userId, pieceId);
    expect(!noVideo.ok && noVideo.error).toMatch(/video completo/);
    await pdb.update(schema.videoExports).set({ status: "lista" }).where(eq(schema.videoExports.pieceId, pieceId));
  });

  it("planea: encola, genera el plan y deja la edición en revisión", async () => {
    const svc = await import("@/lib/edit/service");
    expect((await svc.requestEdit(userId, pieceId)).ok).toBe(true);
    expect((await svc.requestEdit(userId, pieceId)).ok).toBe(false); // ya está en proceso
    expect((await pdb.select().from(schema.jobs)).some((j) => j.kind === "edicion.planear")).toBe(true);
    const e = (await svc.getEdit(userId, pieceId))!;
    await svc.runPlan(userId, e.id);
    const done = (await svc.getEdit(userId, pieceId))!;
    expect(done.status).toBe("revision");
    expect(done.mock).toBe(true);
    const plan = svc.parsePlan(done.plan)!;
    expect(plan.textos_pantalla.some((t) => t.tipo === "gancho")).toBe(true);
    expect(plan.subtitulos.lineas.length).toBeGreaterThan(3);
    expect(plan.resumen.length).toBeLessThanOrEqual(4);
    expect(svc.parseWords(done.words).length).toBeGreaterThan(5);
    expect(svc.checkEdit(done)!.finalSeconds).toBeLessThanOrEqual(61);
  }, 30_000);

  it("cambios sin IA: restaura cortes, edita textos y valida lo que no existe", async () => {
    const svc = await import("@/lib/edit/service");
    const plan = svc.parsePlan((await svc.getEdit(userId, pieceId))!.plan)!;
    if (plan.cortes.length) {
      expect((await svc.toggleCut(userId, pieceId, 0)).ok).toBe(true);
      expect(svc.parseOverrides((await svc.getEdit(userId, pieceId))!.overrides).restored).toEqual([0]);
      await svc.toggleCut(userId, pieceId, 0);
      expect(svc.parseOverrides((await svc.getEdit(userId, pieceId))!.overrides).restored).toEqual([]);
    }
    expect((await svc.toggleCut(userId, pieceId, 999)).ok).toBe(false);
    expect((await svc.setSubtitle(userId, pieceId, 0, "  Texto corregido  ")).ok).toBe(true);
    expect((await svc.setSubtitle(userId, pieceId, 0, "   ")).ok).toBe(false);
    expect((await svc.setTitle(userId, pieceId, 0, "Nuevo gancho")).ok).toBe(true);
    expect(svc.parseOverrides((await svc.getEdit(userId, pieceId))!.overrides)).toMatchObject({ subtitles: { "0": "Texto corregido" }, titles: { "0": "Nuevo gancho" } });
  }, 30_000);

  it("aplica las respuestas a las dudas de transcripción sin tocar lo editado a mano", async () => {
    const { applyDoubts } = await import("@/lib/edit/service");
    const { planSchema, EMPTY_OVERRIDES } = await import("@/lib/edit/schemas");
    const plan = planSchema.parse({ subtitulos: { lineas: [{ inicio_s: 0, fin_s: 1, texto: "me gusta el like", resaltar: [] }, { inicio_s: 1, fin_s: 2, texto: "otro like", resaltar: [] }] }, dudas_transcripcion: [{ segundo: 0.5, escuche: "like", propuesta: "live" }] });
    const r = applyDoubts(plan, { ...EMPTY_OVERRIDES, doubts: { "0": "propuesta" }, subtitles: { "1": "mío" } });
    expect(r.subtitulos.lineas.map((l) => l.texto)).toEqual(["me gusta el live", "otro like"]);
    expect(applyDoubts(plan, { ...EMPTY_OVERRIDES, doubts: { "0": "escuche" } }).subtitulos.lineas[0]!.texto).toBe("me gusta el like");
  });

  it("renderiza: usa ffmpeg con el filtro, sube video y portada y limpia", async () => {
    const svc = await import("@/lib/edit/service");
    expect((await svc.requestRender(userId, pieceId)).ok).toBe(true);
    const e = (await svc.getEdit(userId, pieceId))!;
    expect(e.status).toBe("renderizando");
    await svc.runRender(userId, e.id);
    const done = (await svc.getEdit(userId, pieceId))!;
    expect(done.status).toBe("lista");
    expect(done.outputKey).toMatch(new RegExp(`^ediciones/${userId}/${pieceId}/.+\\.mp4$`));
    expect(done.coverKey).toMatch(/portada-.+\.png$/);
    expect(done.outputSeconds).toBeGreaterThan(0);
    expect(holder.uploaded.filter((k) => k.startsWith("ediciones/"))).toHaveLength(2);
    const mainCall = holder.calls.find((c) => c.includes("-filter_complex"))!;
    expect(mainCall).toContain("libx264");
    expect(await svc.openEdited(userId, pieceId, "video")).not.toBeNull();
    expect(await svc.openEdited(basicId, pieceId, "video")).toBeNull();
  }, 30_000);

  it("permite hasta 3 ajustes con nota y vuelve a planear sin gastar cupo", async () => {
    const svc = await import("@/lib/edit/service");
    const before = (await svc.editQuota(userId)).used;
    expect((await svc.requestAdjust(userId, pieceId, "")).ok).toBe(false);
    for (let i = 1; i <= 3; i++) {
      expect((await svc.requestAdjust(userId, pieceId, `quiero otro ritmo ${i}`)).ok).toBe(true);
      const e = (await svc.getEdit(userId, pieceId))!;
      expect(e.status).toBe("planeando");
      expect(e.adjustments).toBe(i);
      await svc.runPlan(userId, e.id);
      await pdb.update(schema.videoEdits).set({ status: "revision" }).where(eq(schema.videoEdits.id, e.id));
    }
    const fourth = await svc.requestAdjust(userId, pieceId, "uno más");
    expect(fourth.ok).toBe(false);
    expect(!fourth.ok && fourth.error).toMatch(/3 ajustes/);
    expect((await svc.editQuota(userId)).used).toBe(before);
  }, 60_000);

  it("si ffmpeg falla deja el error visible y limpia lo temporal", async () => {
    const svc = await import("@/lib/edit/service");
    const e = (await svc.getEdit(userId, pieceId))!;
    await pdb.update(schema.videoEdits).set({ status: "renderizando" }).where(eq(schema.videoEdits.id, e.id));
    holder.fail = true;
    await expect(svc.runRender(userId, e.id)).rejects.toThrow(/ffmpeg/);
    holder.fail = false;
    const after = (await svc.getEdit(userId, pieceId))!;
    expect(after.status).toBe("error");
    expect(after.error).toMatch(/ffmpeg/);
  }, 30_000);

  it("respeta el cupo mensual configurado", async () => {
    const { saveLimits, DEFAULT_LIMITS } = await import("@/lib/admin/limits");
    const [admin] = await pdb.insert(schema.users).values({ email: "adm@x.com", name: "Adm", passwordHash: "x", role: "admin" }).returning();
    await saveLimits({ ...DEFAULT_LIMITS, editsMonthlyPro: 1 }, admin!.id);
    const svc = await import("@/lib/edit/service");
    const q = await svc.editQuota(userId);
    expect(q.limit).toBe(1);
    expect(q.used).toBe(0); // la edición en error no cuenta
    const [p2] = await pdb.insert(schema.contentPieces).values({ planId: (await pdb.select().from(schema.weekPlans))[0]!.id, userId, n: 2, day: "2026-10-21", publishTime: "08:00", kind: "video", category: "nicho", type: "probado", pillar: "p", topic: "Otro", script: { gancho: "g", cuerpo: ["a"], cierre: "c" } }).returning();
    await pdb.insert(schema.videoExports).values({ userId, pieceId: p2!.id, status: "lista", objectKey: "exp-2", bytes: 10, seconds: 10 });
    expect((await svc.requestEdit(userId, p2!.id)).ok).toBe(true);
    const [p3] = await pdb.insert(schema.contentPieces).values({ planId: (await pdb.select().from(schema.weekPlans))[0]!.id, userId, n: 3, day: "2026-10-22", publishTime: "08:00", kind: "video", category: "nicho", type: "probado", pillar: "p", topic: "Otro 3", script: { gancho: "g", cuerpo: ["a"], cierre: "c" } }).returning();
    await pdb.insert(schema.videoExports).values({ userId, pieceId: p3!.id, status: "lista", objectKey: "exp-3", bytes: 10, seconds: 10 });
    const over = await svc.requestEdit(userId, p3!.id);
    expect(over.ok).toBe(false);
    expect(!over.ok && over.error).toMatch(/ediciones de este mes/);
  }, 30_000);
});
