import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown, deleted: [] as string[] }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/storage", () => ({
  deleteObject: async (k: string) => void holder.deleted.push(k),
  getObject: async () => null,
  putObjectStream: async () => undefined,
  storageConfigured: () => true,
}));

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
  const [u] = await pdb.insert(schema.users).values({ email: "mar@correo.com", name: "Mar", passwordHash: "x" }).returning();
  userId = u!.id;
}, 30_000);

const current = { usuario: "mar.huerto", nombre: "Mar | Huerto", biografia: "Te enseño a sembrar", enlace: null, categoria: null, destacadas: ["Sembrando", "Riego"] };

describe("reglas de código del perfil", () => {
  it("descarta biografías de más de 150 caracteres y cuenta de verdad", async () => {
    const { cleanBios, cleanHighlightName, nameHasKeyword } = await import("@/lib/profile/schemas");
    const bios = cleanBios([{ texto: "a".repeat(150) }, { texto: "a".repeat(151) }, { texto: "  " }, { texto: "🌱 hola" }]);
    expect(bios.map((b) => b.caracteres)).toEqual([150, 6]);
    expect(cleanHighlightName("Una destacada larguísima")).toHaveLength(15);
    expect(nameHasKeyword("Mar | Huerto en casa", ["huerto"])).toBe(true);
    expect(nameHasKeyword("Mar", ["huerto"])).toBe(false);
  });
});

describe("optimización de perfil (sin IA: propuestas de ejemplo)", () => {
  it("pide el perfil actual antes de generar", async () => {
    const svc = await import("@/lib/profile/service");
    expect((await svc.generateProfile(userId)).ok).toBe(false);
    expect((await svc.saveCurrent(userId, { nombre: "", biografia: "", usuario: "" })).ok).toBe(false);
  }, 30_000);

  it("genera 5 nombres y 5 biografías dentro del límite y destacadas de máximo 15 caracteres", async () => {
    const svc = await import("@/lib/profile/service");
    expect((await svc.saveCurrent(userId, current)).ok).toBe(true);
    expect((await svc.generateProfile(userId)).ok).toBe(true);
    const r = svc.parseResult((await svc.getProfile(userId))!.result)!;
    expect(r.nombre.opciones).toHaveLength(5);
    expect(r.biografia.opciones.every((b) => [...b.texto].length <= 150)).toBe(true);
    expect(r.destacadas.length).toBeLessThanOrEqual(7);
    expect(r.destacadas.every((d) => [...d.nombre].length <= 15)).toBe(true);
    expect(r.destacadas.find((d) => d.nombre === "Sembrando")?.accion).toBe("mantener");
  }, 30_000);

  it("elige, edita y avisa si el nombre no lleva palabra clave", async () => {
    const svc = await import("@/lib/profile/service");
    const row = (await svc.getProfile(userId))!;
    const r = svc.parseResult(row.result)!;
    const ok = await svc.choosePart(userId, "nombre", r.nombre.opciones[0]!, false);
    expect(ok.ok).toBe(true);
    const bad = await svc.choosePart(userId, "biografia", "x".repeat(151), true);
    expect(bad.ok).toBe(false);
    const own = await svc.choosePart(userId, "nombre", "Solo mi nombre", true);
    expect(own.ok && own.warning).toBeTruthy();
    expect(svc.parseVotes((await svc.getProfile(userId))!.votes).nombre?.voto).toBe("editado");
  }, 30_000);

  it("pide otras 5 hasta 2 veces sin borrar las anteriores", async () => {
    const svc = await import("@/lib/profile/service");
    expect((await svc.refreshPart(userId, "nombre", "")).ok).toBe(false);
    expect((await svc.refreshPart(userId, "nombre", "más cortos")).ok).toBe(true);
    expect((await svc.refreshPart(userId, "nombre", "más cercanos")).ok).toBe(true);
    expect((await svc.refreshPart(userId, "nombre", "otra vez")).ok).toBe(false);
    const row = (await svc.getProfile(userId))!;
    expect(svc.parseExtra(row.extra).nombre).toHaveLength(2);
    expect(svc.parseResult(row.result)!.nombre.opciones).toHaveLength(5);
  }, 30_000);

  it("marca partes como aplicadas", async () => {
    const svc = await import("@/lib/profile/service");
    await svc.toggleApplied(userId, "biografia");
    expect(svc.parseApplied((await svc.getProfile(userId))!.applied).biografia).toBe(true);
    await svc.toggleApplied(userId, "biografia");
    expect(svc.parseApplied((await svc.getProfile(userId))!.applied).biografia).toBe(false);
  });
});

describe("foto de perfil (sin Gemini: calificación de ejemplo)", () => {
  it("califica, compara y conserva el historial", async () => {
    const svc = await import("@/lib/profile/service");
    const sharp = (await import("sharp")).default;
    const img = await sharp({ create: { width: 60, height: 60, channels: 3, background: "#369" } }).png().toBuffer();
    expect((await svc.scorePhoto(userId, Buffer.from("no es imagen"), "image/png")).ok).toBe(false);
    expect((await svc.scorePhoto(userId, img, "image/png")).ok).toBe(true);
    expect((await svc.scorePhoto(userId, img, "image/png")).ok).toBe(true);
    const photos = svc.parsePhotos((await svc.getProfile(userId))!.photos);
    expect(photos).toHaveLength(2);
    expect(photos[0]!.mock).toBe(true);
    expect(svc.winner(photos)).toBe(0); // empate: gana la primera
    await svc.removePhoto(userId, photos[0]!.key);
    expect(holder.deleted).toContain(photos[0]!.key);
    expect(svc.parsePhotos((await svc.getProfile(userId))!.photos)).toHaveLength(1);
  }, 30_000);
});
