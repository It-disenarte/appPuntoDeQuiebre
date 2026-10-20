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
let planId = "";

const piece = (n: number, day: string, status: "pendiente" | "grabado" | "publicado") =>
  pdb.insert(schema.contentPieces).values({ planId, userId, n, day, publishTime: "08:00", kind: "video", category: "viral", type: "probado", pillar: "P", topic: `Tema ${n}`, script: { gancho: "g", cuerpo: ["c"], cierre: "x" }, status });

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "act@x.com", name: "Act", passwordHash: "x" }).returning();
  userId = u!.id;
  const [plan] = await pdb.insert(schema.weekPlans).values({ userId, weekStart: "2026-10-19", tier: "basico", skillVersion: "t", stage: "arranque", mix: { viral: 50, nicho: 50, conversion: 0 } }).returning();
  planId = plan!.id;
}, 30_000);

describe("métricas: solo se piden si ya empezó", () => {
  it("sin nada grabado o publicado en el mes no hay métricas que pedir; con una pieza grabada sí", async () => {
    const { hadActivityIn } = await import("@/lib/metrics/service");
    expect(await hadActivityIn(userId, "2026-09")).toBe(false);
    await piece(1, "2026-09-30", "pendiente"); // solo una idea: no cuenta
    expect(await hadActivityIn(userId, "2026-09")).toBe(false);
    await piece(2, "2026-10-01", "publicado"); // es de octubre: no cuenta para septiembre
    expect(await hadActivityIn(userId, "2026-09")).toBe(false);
    await piece(3, "2026-09-30", "grabado");
    expect(await hadActivityIn(userId, "2026-09")).toBe(true);
    expect(await hadActivityIn(userId, "2026-10")).toBe(true);
    expect(await hadActivityIn(userId, "2026-12")).toBe(false);
  });
});
