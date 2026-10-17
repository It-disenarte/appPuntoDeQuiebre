import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown, deleted: [] as string[], stored: [] as string[] }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/storage", () => ({
  deleteObject: async (k: string) => void holder.deleted.push(k),
  getObject: async () => null,
  putObjectStream: async (k: string) => void holder.stored.push(k),
  storageConfigured: () => true,
}));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";
let id = "";

const brief = { tema: "Cómo empezar un huerto", origen: "propio", tipo: "lista", objetivo: "guardados", palabra_clave: null, estilo_imagenes: "mixto", animado: false };

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.ANTHROPIC_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "eva@correo.com", name: "Eva", passwordHash: "x" }).returning();
  userId = u!.id;
}, 30_000);

describe("carruseles (sin IA: respuestas de ejemplo)", () => {
  it("rechaza un brief incompleto y pide la palabra clave si el objetivo es leads", async () => {
    const svc = await import("@/lib/carousel/service");
    expect((await svc.createCarousel(userId, { ...brief, tema: "a" })).ok).toBe(false);
    expect((await svc.createCarousel(userId, { ...brief, objetivo: "leads" })).ok).toBe(false);
  });

  it("recorre ideas → entrevista → carrusel", async () => {
    const svc = await import("@/lib/carousel/service");
    const created = await svc.createCarousel(userId, brief);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    id = created.id;
    let row = (await svc.getCarousel(userId, id))!;
    expect(svc.stepOf(row)).toBe("ideas");
    expect(svc.parseIdeaRounds(row.ideas)[0]!.items).toHaveLength(3);

    expect((await svc.chooseIdea(userId, id, { ideaId: "no-existe" })).ok).toBe(false);
    expect((await svc.chooseIdea(userId, id, { ideaId: "A" })).ok).toBe(true);
    row = (await svc.getCarousel(userId, id))!;
    expect(svc.stepOf(row)).toBe("entrevista"); // mixto pide la entrevista de imágenes
    expect((await svc.saveAnswers(userId, id, { narracion: "" })).ok).toBe(false);
    expect((await svc.saveAnswers(userId, id, { narracion: "Una mesa con luz de ventana", herramienta: "gemini" })).ok).toBe(true);
    row = (await svc.getCarousel(userId, id))!;
    expect(svc.stepOf(row)).toBe("carrusel");
    const c = svc.parseContent(row.content)!;
    expect(c.slides.length).toBeGreaterThanOrEqual(6);
    expect(c.slides[0]!.plantilla).toMatch(/^portada/);
    expect(c.slides.map((s) => s.n)).toEqual(c.slides.map((_, i) => i + 1));
  }, 30_000);

  it("limita las rondas de ideas nuevas", async () => {
    const svc = await import("@/lib/carousel/service");
    const created = await svc.createCarousel(userId, { ...brief, estilo_imagenes: "solo_texto" });
    if (!created.ok) throw new Error("no se creó");
    expect((await svc.refreshIdeas(userId, created.id, "muy genéricas")).ok).toBe(true);
    expect((await svc.refreshIdeas(userId, created.id, "todavía no")).ok).toBe(true);
    const third = await svc.refreshIdeas(userId, created.id, "otra vez");
    expect(third.ok).toBe(false);
    // Solo texto no pide entrevista: elegir una idea arma el carrusel directo.
    expect((await svc.chooseIdea(userId, created.id, { own: "Mi idea propia sobre el huerto" })).ok).toBe(true);
    expect(svc.stepOf((await svc.getCarousel(userId, created.id))!)).toBe("carrusel");
  }, 30_000);

  it("edita a mano, reordena y mantiene la portada primero", async () => {
    const svc = await import("@/lib/carousel/service");
    expect((await svc.editSlide(userId, id, 2, { titulo: "", cuerpo: null, resaltar: null, plantilla: "texto" })).ok).toBe(false);
    expect((await svc.editSlide(userId, id, 2, { titulo: "Nuevo título", cuerpo: "Texto", resaltar: "Nuevo", plantilla: "frase" })).ok).toBe(true);
    expect((await svc.editSlide(userId, id, 2, { titulo: "x", cuerpo: Array(60).fill("palabra").join(" "), resaltar: null, plantilla: "texto" })).ok).toBe(false);
    expect((await svc.moveSlide(userId, id, 2, "up")).ok).toBe(false); // no pasa a la portada
    expect((await svc.moveSlide(userId, id, 2, "down")).ok).toBe(true);
    const c = svc.parseContent((await svc.getCarousel(userId, id))!.content)!;
    expect(c.slides[2]!.titulo).toBe("Nuevo título");
    expect(c.slides[0]!.n).toBe(1);
  });

  it("rehace un slide hasta 3 veces", async () => {
    const svc = await import("@/lib/carousel/service");
    for (let i = 0; i < 3; i++) expect((await svc.rewriteSlide(userId, id, 4, "más corto")).ok).toBe(true);
    const fourth = await svc.rewriteSlide(userId, id, 4, "otra vez");
    expect(fourth.ok).toBe(false);
    expect(svc.attemptsLeft((await svc.getCarousel(userId, id))!, 4)).toBe(0);
  });

  it("rehacer todo el carrusel tiene tope de 2", async () => {
    const svc = await import("@/lib/carousel/service");
    expect((await svc.generateCarousel(userId, id, "más directo")).ok).toBe(true);
    expect((await svc.generateCarousel(userId, id, "otra vez")).ok).toBe(true);
    expect((await svc.generateCarousel(userId, id, "una más")).ok).toBe(false);
  }, 30_000);

  it("las imágenes siguen a su slide y se borran con el carrusel", async () => {
    const svc = await import("@/lib/carousel/service");
    const big = await (await import("sharp")).default({ create: { width: 40, height: 40, channels: 3, background: "#f60" } }).png().toBuffer();
    expect((await svc.addImage(userId, id, 2, big, "image/png")).ok).toBe(true);
    expect((await svc.addImage(userId, id, 2, Buffer.from("no es una imagen"), "image/png")).ok).toBe(false);
    expect((await svc.moveSlide(userId, id, 2, "down")).ok).toBe(true);
    expect(Object.keys(svc.parseImages((await svc.getCarousel(userId, id))!.images))).toEqual(["3"]);
    expect((await svc.setFocal(userId, id, 3, { x: 20, y: 80 })).ok).toBe(true);
    expect((await svc.setFocal(userId, id, 3, { x: 200, y: 0 })).ok).toBe(false);
    await svc.deleteCarousel(userId, id);
    expect(await svc.getCarousel(userId, id)).toBeNull();
    expect(holder.deleted.some((k) => k.includes(`carruseles/${userId}/${id}/`))).toBe(true);
  }, 30_000);

  it("otro usuario no ve ni toca un carrusel ajeno", async () => {
    const svc = await import("@/lib/carousel/service");
    const created = await svc.createCarousel(userId, brief);
    if (!created.ok) throw new Error("no se creó");
    const [other] = await pdb.insert(schema.users).values({ email: "otro@correo.com", name: "Otro", passwordHash: "x" }).returning();
    expect(await svc.getCarousel(other!.id, created.id)).toBeNull();
    expect((await svc.chooseIdea(other!.id, created.id, { ideaId: "A" })).ok).toBe(false);
  }, 30_000);
});
