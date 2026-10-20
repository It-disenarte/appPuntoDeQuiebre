import { writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown, calls: [] as string[][] }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/storage", () => ({
  deleteObject: async () => undefined,
  getObject: async () => ({ body: new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])).body!, contentType: "video/mp4", contentLength: 8, contentRange: undefined, partial: false }),
  putObjectStream: async (_k: string, body: AsyncIterable<unknown>) => {
    for await (const _ of body) void _;
  },
  storageConfigured: () => true,
}));
vi.mock("@/lib/recording/ffmpeg", async (orig) => {
  const real = await orig<typeof import("@/lib/recording/ffmpeg")>();
  return { ...real, probeVideo: async () => ({ duration: 30, width: 1080 }), runFfmpeg: async (args: string[]) => (holder.calls.push(args), void (await writeFile(args[args.length - 1]!, Buffer.alloc(64)))) };
});

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";
let pieceId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "mix@x.com", name: "Mix", passwordHash: "x" }).returning();
  userId = u!.id;
  await pdb.insert(schema.subscriptions).values({ userId, providerSubscriptionId: "sub_m", plan: "pro", status: "active" });
  const [plan] = await pdb.insert(schema.weekPlans).values({ userId, weekStart: "2026-10-19", tier: "pro", skillVersion: "t", stage: "arranque", mix: { viral: 50, nicho: 50, conversion: 0 } }).returning();
  const [p] = await pdb.insert(schema.contentPieces).values({ planId: plan!.id, userId, n: 1, day: "2026-10-20", publishTime: "08:00", kind: "video", category: "viral", type: "probado", pillar: "Proceso", topic: "Detrás de cámaras de mi sesión", script: { gancho: "Una vez que empiezas no podrás parar", cuerpo: ["Hoy grabé mi primera sesión", "Así se sintió"], cierre: "Sígueme para ver el resultado" } }).returning();
  pieceId = p!.id;
  await pdb.insert(schema.videoExports).values({ userId, pieceId, status: "lista", objectKey: "exp-m", bytes: 100, seconds: 30 });
}, 30_000);

describe("edición en modo mixto (sin IA: plan de ejemplo)", () => {
  it("planea con línea de tiempo, no deja restaurar cortes y renderiza con los segmentos del mixto", async () => {
    const svc = await import("@/lib/edit/service");
    expect((await svc.requestEdit(userId, pieceId, "mixto")).ok).toBe(true);
    const e = (await svc.getEdit(userId, pieceId))!;
    expect(e.mode).toBe("mixto");
    await svc.runPlan(userId, e.id);
    const planned = (await svc.getEdit(userId, pieceId))!;
    expect(planned.status).toBe("revision");
    const plan = svc.parsePlan(planned.plan)!;
    expect(plan.modo).toBe("mixto");
    expect(plan.linea_de_tiempo.length).toBeGreaterThan(0);
    expect(plan.linea_de_tiempo[0]!.tramo).toBe(1);
    const restore = await svc.toggleCut(userId, pieceId, 0);
    expect(restore.ok).toBe(false);
    expect(!restore.ok && restore.error).toMatch(/Pedir un cambio/);
    expect((await svc.requestRender(userId, pieceId)).ok).toBe(true);
    await svc.runRender(userId, planned.id);
    expect((await svc.getEdit(userId, pieceId))!.status).toBe("lista");
    expect(holder.calls.some((c) => c.includes("-filter_complex"))).toBe(true);
  }, 30_000);

  it("volver a pedir la edición puede cambiar de modo", async () => {
    const svc = await import("@/lib/edit/service");
    expect((await svc.requestEdit(userId, pieceId, "a_camara")).ok).toBe(true);
    expect((await svc.getEdit(userId, pieceId))!.mode).toBe("a_camara");
  }, 30_000);
});
