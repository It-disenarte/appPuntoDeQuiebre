import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
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
let pieceId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.GEMINI_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "leo@correo.com", name: "Leo", passwordHash: "x" }).returning();
  userId = u!.id;
  const [plan] = await pdb.insert(schema.weekPlans).values({ userId, weekStart: "2026-10-19", tier: "basico", skillVersion: "t", stage: "arranque", mix: { viral: 50, nicho: 50, conversion: 0 } }).returning();
  const [p] = await pdb
    .insert(schema.contentPieces)
    .values({ planId: plan!.id, userId, n: 1, day: "2026-10-20", publishTime: "08:00", kind: "video", category: "viral", type: "probado", pillar: "p", topic: "Tema", script: { gancho: "Gancho fuerte", cuerpo: ["a"], cierre: "c", duracion_segundos: 30 } })
    .returning();
  pieceId = p!.id;
}, 30_000);

const addParts = async (parts: ("gancho" | "cuerpo" | "cierre")[]) => {
  for (const part of parts) await pdb.insert(schema.recordings).values({ userId, pieceId, part, objectKey: `k-${part}-${Math.random()}`, contentType: "video/mp4", bytes: 1000, seconds: 10 }).onConflictDoNothing();
};

describe("El Lente (sin Gemini: revisión de ejemplo)", () => {
  it("exige las 3 partes antes de revisar", async () => {
    const svc = await import("@/lib/coach/service");
    await addParts(["gancho"]);
    expect((await svc.requestReview(userId, pieceId)).ok).toBe(false);
  }, 30_000);

  it("revisa, limita a 2 mejoras y encola el trabajo", async () => {
    const svc = await import("@/lib/coach/service");
    await addParts(["cuerpo", "cierre"]);
    expect((await svc.requestReview(userId, pieceId)).ok).toBe(true);
    expect((await svc.requestReview(userId, pieceId)).ok).toBe(false); // ya está en proceso
    const jobs = await pdb.select().from(schema.jobs);
    expect(jobs.some((j) => j.kind === "coach.revisar")).toBe(true);
    const [review] = await svc.listReviews(userId, pieceId);
    await svc.runReview(userId, review!.id);
    const done = (await svc.listReviews(userId, pieceId))[0]!;
    expect(done.status).toBe("lista");
    expect(done.mock).toBe(true);
    const out = svc.parseResult(done.result)!;
    expect(out.mejoras.length).toBeLessThanOrEqual(2);
    expect(out.veredicto).toBe("otra_toma_opcional");
  }, 30_000);

  it("la segunda revisión pide una toma nueva, es siempre “listo” y hay máximo dos", async () => {
    const svc = await import("@/lib/coach/service");
    expect((await svc.requestReview(userId, pieceId)).ok).toBe(false); // aún no regraba
    await pdb.update(schema.recordings).set({ updatedAt: new Date(Date.now() + 60_000) }).where(eq(schema.recordings.pieceId, pieceId));
    expect((await svc.requestReview(userId, pieceId)).ok).toBe(true);
    const second = (await svc.listReviews(userId, pieceId)).find((r) => r.numero === 2)!;
    await svc.runReview(userId, second.id);
    const out = svc.parseResult((await svc.listReviews(userId, pieceId)).find((r) => r.numero === 2)!.result)!;
    expect(out.veredicto).toBe("listo");
    expect(out.mejoras).toHaveLength(0);
    await pdb.update(schema.recordings).set({ updatedAt: new Date(Date.now() + 120_000) }).where(eq(schema.recordings.pieceId, pieceId));
    const third = await svc.requestReview(userId, pieceId);
    expect(third.ok).toBe(false);
    expect(!third.ok && third.error).toMatch(/2 revisiones/);
  }, 30_000);

  it("respeta la cuota mensual del plan y guarda las calificaciones", async () => {
    const svc = await import("@/lib/coach/service");
    const q = await svc.monthlyQuota(userId);
    expect(q.limit).toBe(2); // Básico: 2 al mes por defecto
    expect(q.used).toBe(2);
    const [r] = await svc.listReviews(userId, pieceId);
    expect((await svc.voteImprovement(userId, r!.id, 0, { voto: "no", nota: "ya lo hago" })).ok).toBe(true);
    expect((await svc.voteImprovement(userId, r!.id, 0, { voto: "quizá" })).ok).toBe(false);
    const other = (await pdb.insert(schema.users).values({ email: "otro2@correo.com", name: "Otro", passwordHash: "x" }).returning())[0]!;
    expect((await svc.voteImprovement(other.id, r!.id, 0, { voto: "si" })).ok).toBe(false); // no es suyo
  }, 30_000);

  it("“así lo publico” no vuelve a preguntar", async () => {
    const svc = await import("@/lib/coach/service");
    const [plan] = await pdb.select().from(schema.weekPlans).limit(1);
    const [p2] = await pdb.insert(schema.contentPieces).values({ planId: plan!.id, userId, n: 2, day: "2026-10-21", publishTime: "08:00", kind: "video", category: "nicho", type: "probado", pillar: "p", topic: "Otro", script: { gancho: "g", cuerpo: ["a"], cierre: "c" } }).returning();
    await svc.declineReview(userId, p2!.id);
    await svc.declineReview(userId, p2!.id); // idempotente
    const rows = await svc.listReviews(userId, p2!.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("omitida");
  }, 30_000);
});
