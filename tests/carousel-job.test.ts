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
const brief = { tema: "Cómo empezar un huerto", origen: "propio", tipo: "lista", objetivo: "guardados", palabra_clave: null, estilo_imagenes: "mixto", animado: false };

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "job@correo.com", name: "Job", passwordHash: "x" }).returning();
  userId = u!.id;
}, 30_000);

describe("carruseles en segundo plano", () => {
  it("el carrusel existe desde el primer toque, pide las ideas al worker y no deja encimar otro paso", async () => {
    const svc = await import("@/lib/carousel/service");
    const created = await svc.startCarousel(userId, brief);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.id;

    // Aunque la persona salga de la app, el carrusel ya está y su paso está en cola.
    let row = (await svc.getCarousel(userId, id))!;
    expect(svc.parseIdeaRounds(row.ideas)).toHaveLength(0);
    const job = (await svc.latestCarouselJob(userId, id))!;
    expect(job).toMatchObject({ op: "ideas", status: "pendiente", active: true });
    const again = await svc.queueCarouselOp(userId, id, "otras", { nota: "más cortas" });
    expect(again.ok).toBe(false);

    // El worker corre el paso.
    const [queued] = await pdb.select().from(schema.jobs);
    await svc.runCarouselOp(userId, queued!.payload as never);
    await pdb.update(schema.jobs).set({ status: "lista" }).where(eq(schema.jobs.id, queued!.id));
    row = (await svc.getCarousel(userId, id))!;
    expect(svc.parseIdeaRounds(row.ideas)[0]!.items).toHaveLength(3);
    expect((await svc.latestCarouselJob(userId, id))!.active).toBe(false);

    // Elegir idea → el paso siguiente también va por la cola y deja el carrusel listo.
    const idea = svc.parseIdeaRounds(row.ideas)[0]!.items[0]!;
    expect((await svc.queueCarouselOp(userId, id, "elegir", { idea: idea.id })).ok).toBe(true);
    const jobs = await pdb.select().from(schema.jobs);
    const second = jobs.find((j) => (j.payload as { op: string }).op === "elegir")!;
    await svc.runCarouselOp(userId, second.payload as never);
    row = (await svc.getCarousel(userId, id))!;
    expect(row.chosen).toBeTruthy();
  }, 30_000);

  it("un paso que no se puede hacer deja el trabajo en error con su motivo (no se pierde en silencio)", async () => {
    const svc = await import("@/lib/carousel/service");
    const created = await svc.startCarousel(userId, brief);
    if (!created.ok) throw new Error("no se creó");
    await expect(svc.runCarouselOp(userId, { id: created.id, op: "slide", args: { n: 3, nota: "x" } })).rejects.toThrow(/slide/i);
  }, 30_000);
});
