import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mondayOf, todayIso } from "@/lib/plan/rules";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";
let noPlanId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "ideas@x.com", name: "Ideas", passwordHash: "x" }).returning();
  userId = u!.id;
  const [n] = await pdb.insert(schema.users).values({ email: "sinplan@x.com", name: "Sin plan", passwordHash: "x" }).returning();
  noPlanId = n!.id;
  const [plan] = await pdb.insert(schema.weekPlans).values({ userId, weekStart: mondayOf(todayIso()), tier: "pro", skillVersion: "t", stage: "arranque", mix: { viral: 50, nicho: 50, conversion: 0 } }).returning();
  await pdb.insert(schema.contentPieces).values({ planId: plan!.id, userId, n: 1, day: todayIso(), publishTime: "19:30", kind: "video", category: "viral", type: "probado", pillar: "Proceso", topic: "Pieza de la parrilla", script: { gancho: "g", cuerpo: ["c"], cierre: "x" } });
}, 30_000);

const idea = { title: "Tuning con poco presupuesto en 3 pasos", hook: "Con $500 cambié mi coche", idea: "Mostrar el antes y después", shortScript: "Muestra el coche. Di el gasto. Revela el cambio.", creator: "nocturna.dc" };

describe("banco de ideas", () => {
  it("guarda sin duplicar, respeta el máximo y deja quitar", async () => {
    const bank = await import("@/lib/ideas/bank");
    const a = await bank.saveIdea(userId, idea);
    expect(a).toMatchObject({ ok: true, already: false });
    const b = await bank.saveIdea(userId, idea);
    expect(b).toMatchObject({ ok: true, already: true });
    expect((await bank.saveIdea(userId, { title: "ab" })).ok).toBe(false);
    for (let i = 0; i < bank.MAX_BANK - 1; i++) await bank.saveIdea(userId, { title: `Idea de relleno ${i}` });
    const full = await bank.saveIdea(userId, { title: "Una más que ya no cabe" });
    expect(!full.ok && full.error).toMatch(/banco/);
    expect((await bank.listIdeas(userId, "guardada")).length).toBe(bank.MAX_BANK);
    if (a.ok) {
      await bank.removeIdea(userId, a.id);
      expect(await bank.getIdea(userId, a.id)).toBeNull();
    }
  }, 30_000);

  it("la parrilla toma las ideas más antiguas y las marca como usadas", async () => {
    const bank = await import("@/lib/ideas/bank");
    const take = await bank.ideasForWeek(userId, 3);
    expect(take).toHaveLength(3);
    expect(take[0]!.title).toBe("Idea de relleno 0");
    await bank.markIdeasUsed(take.map((t) => t.id));
    expect((await bank.listIdeas(userId, "usada")).length).toBe(3);
    expect((await bank.ideasForWeek(userId, 3))[0]!.title).toBe("Idea de relleno 3");
  });
});

describe("video desde una idea", () => {
  it("no se puede pedir sin semana; con semana queda en cola una sola vez", async () => {
    const bank = await import("@/lib/ideas/bank");
    const svc = await import("@/lib/ideas/service");
    const s = await bank.saveIdea(noPlanId, idea);
    if (!s.ok) throw new Error("no se guardó");
    const r = await svc.queueVideoFromIdea(noPlanId, s.id);
    expect(!r.ok && r.error).toMatch(/semana/);

    const mine = await bank.saveIdea(userId, { ...idea, title: "Idea para video" });
    if (!mine.ok) throw new Error("no se guardó");
    expect((await svc.queueVideoFromIdea(userId, mine.id)).ok).toBe(true);
    const again = await svc.queueVideoFromIdea(userId, mine.id);
    expect(!again.ok && again.error).toMatch(/Ya estamos/);
    const queued = await pdb.select().from(schema.jobs).where(eq(schema.jobs.kind, "idea.video"));
    expect(queued).toHaveLength(1);
  });

  it("agrega a la semana actual un video extra (siguiente número, hoy) y marca la idea con su pieza", async () => {
    const bank = await import("@/lib/ideas/bank");
    const svc = await import("@/lib/ideas/service");
    const saved = await bank.saveIdea(userId, { ...idea, title: "Idea que se vuelve video" });
    if (!saved.ok) throw new Error("no se guardó");
    const row = (await bank.getIdea(userId, saved.id))!;
    const r = await svc.addVideoPiece(userId, row, { pillar: "Proceso", script: { gancho: "Con $500 cambié mi coche", cuerpo: ["Antes", "Después"], cierre: "Sígueme" } as never });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [piece] = await pdb.select().from(schema.contentPieces).where(eq(schema.contentPieces.id, r.pieceId));
    expect(piece).toMatchObject({ n: 2, kind: "video", day: todayIso(), publishTime: "19:30", status: "pendiente", topic: "Idea que se vuelve video" });
    const after = (await bank.getIdea(userId, saved.id))!;
    expect(after).toMatchObject({ status: "usada", pieceId: r.pieceId });
    // Ya es video: no se vuelve a pedir.
    const again = await svc.queueVideoFromIdea(userId, saved.id);
    expect(!again.ok && again.error).toMatch(/ya es un video/i);
  });
});
