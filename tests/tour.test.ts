import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { TOUR_IDS, TOURS, toursForPath } from "@/lib/tour/tours";

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
        if (s.click) expect(s.target && s.path).toBeTruthy(); // un paso de “toca aquí” necesita su elemento y su pantalla
      }
    }
    const paths = ["/hoy", "/semana", "/grabar", "/progreso", "/mi-marca", "/carruseles", "/directos", "/tendencias", "/analizador", "/mi-marca/historia", "/mi-marca/historia/proposito", "/mi-marca/historia/elecciones", "/mi-marca/manual", "/mi-marca/kit", "/mi-marca/horario", "/mi-marca/voz"];
    for (const p of paths) {
      const ids = toursForPath(p, false);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(TOUR_IDS).toContain(id);
    }
    expect(toursForPath("/grabar", true)).toEqual(["grabar-estudio"]);
    expect(toursForPath("/mi-marca/historia/elecciones", false)).toEqual(["elecciones"]);
    expect(toursForPath("/admin", false)).toEqual([]);
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
