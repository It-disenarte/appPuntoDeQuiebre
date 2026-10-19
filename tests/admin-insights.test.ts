import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });

const d = (iso: string) => new Date(`${iso}T15:00:00Z`);
const NOW = d("2026-10-21"); // miércoles

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
}, 30_000);

describe("racha semanal", () => {
  it("cuenta semanas seguidas y perdona la semana en curso si aún no hay actividad", async () => {
    const { streakWeeks, weekKey } = await import("@/lib/admin/insights-core");
    expect(weekKey(d("2026-10-18"))).toBe("2026-10-12"); // domingo → lunes anterior
    expect(streakWeeks([d("2026-10-20"), d("2026-10-13"), d("2026-10-06")], NOW)).toBe(3);
    expect(streakWeeks([d("2026-10-13"), d("2026-10-06")], NOW)).toBe(2); // esta semana todavía no
    expect(streakWeeks([d("2026-10-06")], NOW)).toBe(0); // se rompió hace una semana
    expect(streakWeeks([], NOW)).toBe(0);
  });
});

describe("alertas y métricas (lógica pura)", () => {
  const user = (id: string, createdAt: string, extra = {}) => ({ id, name: id, email: `${id}@x.com`, status: "active", createdAt: d(createdAt), lastLoginAt: null, ...extra });
  const none = { intake: null, manual: null, kit: null, schedule: null, plan: null, recording: null, metrics: null };
  const sub = (status: string, createdAt = "2026-08-01") => ({ plan: "basico" as const, status, trialEnd: null, createdAt: d(createdAt), pastDueSince: status === "past_due" ? d("2026-10-10") : null });

  it("avisa de inactividad, alta atrasada, racha rota y pago en mora; ignora a quien no tiene acceso", async () => {
    const { alertsOf, buildFacts } = await import("@/lib/admin/insights-core");
    const done = { ...none, intake: d("2026-09-01"), schedule: d("2026-09-05") };
    const facts = [
      buildFacts({ user: user("inactiva", "2026-09-01"), sub: sub("active"), milestones: done, workDates: [d("2026-09-20")], lastSeen: d("2026-10-01") }, NOW),
      buildFacts({ user: user("atrasada", "2026-10-01"), sub: sub("active"), milestones: none, workDates: [], lastSeen: d("2026-10-20") }, NOW),
      buildFacts({ user: user("rota", "2026-09-01"), sub: sub("active"), milestones: done, workDates: [d("2026-10-14"), d("2026-10-07")], lastSeen: d("2026-10-21") }, NOW),
      buildFacts({ user: user("mora", "2026-09-01"), sub: sub("past_due"), milestones: done, workDates: [d("2026-10-20")], lastSeen: d("2026-10-20") }, NOW),
      buildFacts({ user: user("sinplan", "2026-08-01"), sub: null, milestones: none, workDates: [], lastSeen: null }, NOW),
      buildFacts({ user: user("cancelada", "2026-08-01"), sub: sub("canceled"), milestones: none, workDates: [], lastSeen: null }, NOW),
    ];
    const a = alertsOf(facts, NOW);
    const kinds = (id: string) => a.filter((x) => x.userId === id).map((x) => x.kind);
    expect(kinds("inactiva")).toContain("inactivo");
    expect(kinds("atrasada")).toContain("alta_atrasada");
    expect(kinds("rota")).toContain("racha_rota");
    expect(kinds("mora")).toEqual(["pago"]);
    expect(kinds("sinplan")).toEqual([]);
    expect(kinds("cancelada")).toEqual([]);
  });

  it("calcula conversión, permanencia y avance por paso", async () => {
    const { businessMetrics, buildFacts } = await import("@/lib/admin/insights-core");
    const mk = (id: string, status: string, subCreated: string, trialEnd: string | null, ms = none) => buildFacts({ user: user(id, "2026-07-01"), sub: { ...sub(status, subCreated), trialEnd: trialEnd ? d(trialEnd) : null }, milestones: ms, workDates: [], lastSeen: null }, NOW);
    const facts = [
      mk("a", "active", "2026-07-15", "2026-08-15", { ...none, intake: d("2026-07-03") }),
      mk("b", "canceled", "2026-07-15", "2026-08-15"),
      mk("c", "trialing", "2026-10-15", "2026-11-15"),
    ];
    const m = businessMetrics(facts, NOW);
    expect(m.creators).toBe(3);
    expect(m.trialToPaid).toMatchObject({ total: 2, paid: 1, pct: 50 });
    expect(m.retention.m2).toMatchObject({ total: 2, kept: 1, pct: 50 });
    const intake = m.milestones.find((x) => x.id === "intake")!;
    expect(intake.done).toBe(1);
    expect(intake.medianDays).toBe(2);
  });
});

describe("límites, costos e ingreso (con base de datos)", () => {
  it("guarda límites válidos y rechaza los absurdos", async () => {
    const { getLimits, saveLimits, DEFAULT_LIMITS } = await import("@/lib/admin/limits");
    const [admin] = await pdb.insert(schema.users).values({ email: "adm@x.com", name: "Adm", passwordHash: "x", role: "admin" }).returning();
    expect(await getLimits()).toEqual(DEFAULT_LIMITS);
    expect((await saveLimits({ ...DEFAULT_LIMITS, analyzerIntervalDays: 14 }, admin!.id)).ok).toBe(true);
    expect((await getLimits()).analyzerIntervalDays).toBe(14);
    expect((await saveLimits({ ...DEFAULT_LIMITS, analyzerIntervalDays: 0 }, admin!.id)).ok).toBe(false);
    expect((await saveLimits({ ...DEFAULT_LIMITS, analyzerIntervalDays: Number.NaN }, admin!.id)).ok).toBe(false);
  }, 30_000);

  it("estima el costo de IA por cliente y suma el ingreso", async () => {
    const { usageSince, incomeSince, loadFacts } = await import("@/lib/admin/insights");
    const { getPrices } = await import("@/lib/admin/limits");
    const [u] = await pdb.insert(schema.users).values({ email: "cli@x.com", name: "Cli", passwordHash: "x" }).returning();
    await pdb.insert(schema.aiCalls).values([
      { userId: u!.id, skill: "brujula", skillVersion: "v", mock: false, status: "ok", costCents: 0, inputTokens: 1_000_000, outputTokens: 100_000 },
      { userId: u!.id, skill: "metricas-capturas", skillVersion: "v", mock: false, status: "ok", costCents: 0 },
      { userId: u!.id, skill: "brujula", skillVersion: "v", mock: true, status: "ok", costCents: 0, inputTokens: 9_000_000, outputTokens: 0 }, // de prueba: no cuesta
      { userId: u!.id, skill: "brujula", skillVersion: "v", mock: false, status: "error", costCents: 0 },
    ]);
    await pdb.insert(schema.payments).values({ userId: u!.id, providerInvoiceId: "in_1", amountCents: 29_900, currency: "mxn", paidAt: new Date() });
    const since = new Date(Date.now() - 86_400_000);
    const prices = await getPrices();
    const use = (await usageSince(since, u!.id, prices)).get(u!.id)!;
    // 1 M entrada × 3 + 0.1 M salida × 15 + 1 llamada de Gemini × 0.01
    expect(use.costUsd).toBeCloseTo(3 + 1.5 + 0.01, 5);
    expect(use.calls).toBe(2);
    expect((await incomeSince(since, u!.id)).get(u!.id)).toBe(29_900);
    const facts = await loadFacts(u!.id);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.doneCount).toBe(0);
  }, 30_000);
});
