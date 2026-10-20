import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { INTAKE_VERSION } from "@/lib/brujula/content";
import { MOCK_STORY } from "@/lib/brujula/voice";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.ANTHROPIC_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "b@x.com", name: "Bea", passwordHash: "x" }).returning();
  userId = u!.id;
}, 30_000);

describe("brújula en segundo plano", () => {
  it("no encola dos veces mientras hay una en curso y avisa del estado", async () => {
    const svc = await import("@/lib/brujula/service");
    expect(await svc.latestManualJob(userId)).toBeNull();
    expect(await svc.queueManual(userId)).toBe("encolado");
    expect(await svc.queueManual(userId)).toBe("en_curso");
    const job = (await svc.latestManualJob(userId))!;
    expect(job.status).toBe("pendiente");
    expect(job.recent).toBe(true);
    const rows = await pdb.select().from(schema.jobs);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.maxAttempts).toBe(1);
  });

  it("el trabajo falla con un mensaje claro si la historia no está completa", async () => {
    const svc = await import("@/lib/brujula/service");
    await expect(svc.runManualJob(userId)).rejects.toThrow(/historia/);
  });

  it("con la historia completa arma la brújula y el perfil de voz (modo de ejemplo, sin IA)", async () => {
    const svc = await import("@/lib/brujula/service");
    await pdb.insert(schema.creatorIntake).values({
      userId,
      story: {
        steps: Object.fromEntries(Object.entries(MOCK_STORY).map(([id, text]) => [id, { text, source: "texto" as const, seconds: null, mock: true }])),
        sell: { mode: "hoy" as const, text: "Asesorías de huerto" },
        storyChoice: "algo_salio_mal" as const,
      },
      quick: { redes: ["instagram", "tiktok"], formatos: ["frente_a_camara", "en_vivo"], tono: ["inspiradora", "autentica"], referentes: ["@uno", "@dos", "@tres"] },
      contentVersion: INTAKE_VERSION,
    });
    expect(svc.intakeProgress((await svc.getIntake(userId))!).ready).toBe(true);
    await svc.runManualJob(userId);
    expect(await svc.getManual(userId)).not.toBeNull();
    expect(await svc.getVoiceProfile(userId)).not.toBeNull();
  }, 30_000);
});
