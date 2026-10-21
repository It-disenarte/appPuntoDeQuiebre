import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));

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
  const [u] = await pdb.insert(schema.users).values({ email: "sem@x.com", name: "Sem", passwordHash: "x" }).returning();
  userId = u!.id;
}, 30_000);

describe("semana en segundo plano", () => {
  it("el último trabajo se puede consultar (activo mientras corre) y un trabajo imposible falla con su motivo", async () => {
    const { enqueue, latestUserJob } = await import("@/lib/jobs");
    expect(await latestUserJob(userId, "semana.generar")).toBeNull();
    await enqueue("semana.generar", userId, { week: "2026-10-26" }, { maxAttempts: 1 });
    const job = (await latestUserJob(userId, "semana.generar"))!;
    expect(job).toMatchObject({ status: "pendiente", active: true, recent: true });
    // Otro tipo de trabajo no se mezcla.
    expect(await latestUserJob(userId, "brujula.generar")).toBeNull();

    const { runWeekJob } = await import("@/lib/plan/service");
    await expect(runWeekJob(userId, { week: "2026-10-26" })).rejects.toThrow(/brújula/i);
  }, 30_000);
});
