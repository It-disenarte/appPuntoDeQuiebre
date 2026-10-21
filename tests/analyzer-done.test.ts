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
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "an@x.com", name: "An", passwordHash: "x" }).returning();
  userId = u!.id;
}, 30_000);

describe("analizador: resultados del último análisis que terminó bien", () => {
  it("un intento posterior que falla no esconde los resultados del anterior, y no cuenta para el límite", async () => {
    const svc = await import("@/lib/analyzer/service");
    expect(await svc.latestDoneRun(userId)).toBeNull();
    const old = new Date(Date.now() - 2 * 86_400_000);
    const [ok] = await pdb.insert(schema.analyzerRuns).values({ userId, status: "lista", params: {}, createdAt: old }).returning();
    const [bad] = await pdb.insert(schema.analyzerRuns).values({ userId, status: "error", params: {}, error: "No se pudo analizar ningún reel. @a: falló" }).returning();
    expect((await svc.latestRun(userId))!.id).toBe(bad!.id);
    expect((await svc.latestDoneRun(userId))!.id).toBe(ok!.id);
    // El límite sale del análisis bueno (el fallido no cuenta).
    const wait = await svc.nextAllowedAt(userId);
    expect(wait).not.toBeNull();
    expect(Math.abs(wait!.getTime() - (old.getTime() + 7 * 86_400_000))).toBeLessThan(5 * 86_400_000);
  });
});
