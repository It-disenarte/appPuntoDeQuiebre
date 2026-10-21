import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/storage", () => ({ deleteObject: async () => undefined, getObject: async () => null, putObjectStream: async () => undefined, storageConfigured: () => true }));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "bg@x.com", name: "Bg", passwordHash: "x" }).returning();
  userId = u!.id;
}, 30_000);

describe("pasos con IA en segundo plano", () => {
  it("un solo paso activo por pantalla, cada pantalla con el suyo, y el estado se puede consultar", async () => {
    const { queueBg, latestBg } = await import("@/lib/bg");
    expect(await latestBg(userId, "tendencias")).toBeNull();
    expect((await queueBg(userId, "tendencias", "tendencias.pedir")).ok).toBe(true);
    const again = await queueBg(userId, "tendencias", "tendencias.otras", { uso: "x", nota: "y" });
    expect(again.ok).toBe(false);
    expect(await latestBg(userId, "tendencias")).toMatchObject({ op: "tendencias.pedir", status: "pendiente", active: true });
    // Otra pantalla (o la pieza de otros textos) no se bloquea.
    expect((await queueBg(userId, "directos", "directos.semana", { week: "2026-10-26" })).ok).toBe(true);
    expect((await queueBg(userId, "textos:a", "textos", { pieceId: "a" })).ok).toBe(true);
    expect((await queueBg(userId, "textos:b", "textos", { pieceId: "b" })).ok).toBe(true);
    expect((await latestBg(userId, "textos:a"))!.op).toBe("textos");
  });

  it("si el paso no se puede hacer, el trabajo falla con su motivo en vez de perderse", async () => {
    const { runBgOp } = await import("@/lib/bg");
    await expect(runBgOp(userId, { scope: "auditoria", op: "auditoria" })).rejects.toThrow();
    await expect(runBgOp(userId, { scope: "textos:z", op: "textos", args: { pieceId: "00000000-0000-4000-8000-000000000000" } })).rejects.toThrow(/pieza|existe/i);
  }, 30_000);
});
