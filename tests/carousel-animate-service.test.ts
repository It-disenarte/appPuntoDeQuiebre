import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown, deleted: [] as string[] }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/storage", () => ({
  storageConfigured: () => true,
  deleteObject: async (k: string) => void holder.deleted.push(k),
  getObject: async () => null,
  putObjectStream: async () => undefined,
}));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";
let carouselId = "";

const slide = (n: number) => ({ n, rol: "punto", plantilla: "texto", titulo: `Punto ${n}`, cuerpo: "texto", imagen: { fuente: "ninguna" } });
const content = { titulo: "Mi carrusel", slides: [slide(1), slide(2), slide(3)] };

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "anim@x.com", name: "Anim", passwordHash: "x" }).returning();
  userId = u!.id;
  await pdb.insert(schema.subscriptions).values({ userId, providerSubscriptionId: "sub_a", plan: "basico", status: "active" });
  const [c] = await pdb.insert(schema.carousels).values({ userId, brief: { tema: "x" }, content }).returning();
  carouselId = c!.id;
}, 30_000);

describe("carrusel animado: plan y cupo", () => {
  it("con el plan Básico no se puede pedir el video", async () => {
    const { animationQuota, requestAnimation } = await import("@/lib/carousel/animate-service");
    expect((await animationQuota(userId)).allowed).toBe(false);
    expect(await requestAnimation(userId, carouselId, "carruseles/x/frames.zip")).toEqual({ ok: false, error: "El carrusel animado es del plan Pro." });
    expect(await pdb.select().from(schema.carouselVideos)).toHaveLength(0);
  });

  it("con Pro se encola el trabajo, no se puede pedir otro mientras corre, y rehacerlo no gasta cupo", async () => {
    await pdb.update(schema.users).set({ proOverride: true }).where(eq(schema.users.id, userId));
    const { setSetting } = await import("@/lib/settings");
    await setSetting("admin_limits", { carouselVideosMonthlyPro: 1 }, userId);
    const { animationQuota, requestAnimation, getAnimation } = await import("@/lib/carousel/animate-service");
    expect(await animationQuota(userId)).toMatchObject({ allowed: true, limit: 1, left: 1 });

    expect(await requestAnimation(userId, carouselId, "carruseles/x/frames-1.zip")).toEqual({ ok: true });
    expect((await getAnimation(userId, carouselId))?.status).toBe("pendiente");
    const jobs = await pdb.select().from(schema.jobs).where(eq(schema.jobs.kind, "carrusel.animar"));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toMatchObject({ carouselId });
    expect((await animationQuota(userId)).left).toBe(0);

    // Mientras se arma, no se acepta otro pedido.
    expect(await requestAnimation(userId, carouselId, "carruseles/x/frames-2.zip")).toMatchObject({ ok: false, error: expect.stringMatching(/Ya estamos animando/) });

    // Ya terminó (con error): se puede rehacer el del mismo carrusel aunque el cupo del mes esté agotado, y se borran los archivos viejos.
    await pdb.update(schema.carouselVideos).set({ status: "error", framesKey: "carruseles/x/frames-1.zip", outputKey: "carruseles/x/viejo.mp4" }).where(eq(schema.carouselVideos.carouselId, carouselId));
    expect(await requestAnimation(userId, carouselId, "carruseles/x/frames-3.zip")).toEqual({ ok: true });
    expect(holder.deleted).toEqual(expect.arrayContaining(["carruseles/x/frames-1.zip", "carruseles/x/viejo.mp4"]));
    expect((await getAnimation(userId, carouselId))?.framesKey).toBe("carruseles/x/frames-3.zip");
  });

  it("otro carrusel con el cupo agotado se rechaza con un mensaje claro", async () => {
    const [c2] = await pdb.insert(schema.carousels).values({ userId, brief: { tema: "y" }, content }).returning();
    const { requestAnimation } = await import("@/lib/carousel/animate-service");
    // El video del primer carrusel quedó "pendiente" otra vez: cuenta contra el cupo de 1.
    expect(await requestAnimation(userId, c2!.id, "carruseles/x/frames-4.zip")).toEqual({ ok: false, error: "Ya usaste tus 1 videos animados de este mes." });
  });

  it("un carrusel ajeno no existe para quien lo pide", async () => {
    const [other] = await pdb.insert(schema.users).values({ email: "otra@x.com", name: "Otra", passwordHash: "x", proOverride: true }).returning();
    const { requestAnimation } = await import("@/lib/carousel/animate-service");
    expect(await requestAnimation(other!.id, carouselId, "k.zip")).toMatchObject({ ok: false });
  });
});
