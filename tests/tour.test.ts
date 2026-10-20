import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { TOUR_IDS, TOURS, tourForPath } from "@/lib/tour/tours";

const holder = vi.hoisted(() => ({ db: null as unknown, userId: "" }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/auth/dal", () => ({ requireUser: async () => ({ id: holder.userId }) }));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
const seen = async () => (await pdb.select({ t: schema.users.toursSeen }).from(schema.users).where(eq(schema.users.id, holder.userId)))[0]!.t;

beforeAll(async () => {
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "t@x.com", name: "T", passwordHash: "x" }).returning();
  holder.userId = u!.id;
}, 30_000);

describe("asistente de inicio", () => {
  it("las guías tienen ids únicos, pasos con texto corto y cada pantalla apunta a una guía que existe", () => {
    expect(new Set(TOUR_IDS).size).toBe(TOURS.length);
    for (const t of TOURS) {
      expect(t.steps.length).toBeGreaterThan(0);
      for (const s of t.steps) {
        expect(s.title.length).toBeLessThanOrEqual(30);
        expect(s.text.length).toBeLessThanOrEqual(120);
      }
    }
    for (const p of ["/hoy", "/semana", "/grabar", "/progreso", "/mi-marca", "/carruseles", "/directos", "/tendencias", "/analizador"]) {
      expect(TOUR_IDS).toContain(tourForPath(p, false));
    }
    expect(tourForPath("/grabar", true)).toBe("grabar-estudio");
    expect(tourForPath("/admin", false)).toBeNull();
  });

  it("marca guías vistas sin repetir, ignora ids inventados y permite reiniciarlas", async () => {
    const { markTourSeenAction, resetToursAction } = await import("@/lib/tour/actions");
    expect(await seen()).toEqual([]);
    await markTourSeenAction("hoy");
    await markTourSeenAction("hoy");
    await markTourSeenAction("semana");
    await markTourSeenAction("no-existe");
    expect(await seen()).toEqual(["hoy", "semana"]);
    await resetToursAction();
    expect(await seen()).toEqual([]);
  });
});
