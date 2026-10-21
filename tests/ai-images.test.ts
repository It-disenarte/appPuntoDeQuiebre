import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown, stored: [] as string[] }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/storage", () => ({
  deleteObject: async () => undefined,
  getObject: async () => null,
  putObjectStream: async (k: string) => void holder.stored.push(k),
  storageConfigured: () => true,
}));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";
let id = "";
let iaSlide = 0;
let png: Buffer;

const brief = { tema: "Cómo empezar un huerto", origen: "propio", tipo: "lista", objetivo: "guardados", palabra_clave: null, estilo_imagenes: "ia", animado: false };

const geminiImage = (data: Buffer) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "listo" }, { inlineData: { mimeType: "image/png", data: data.toString("base64") } }] } }] }), { status: 200 });

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "img@x.com", name: "Img", passwordHash: "x" }).returning();
  userId = u!.id;
  png = await (await import("sharp")).default({ create: { width: 64, height: 80, channels: 3, background: "#f60" } }).png().toBuffer();
  const svc = await import("@/lib/carousel/service");
  const created = await svc.createCarousel(userId, brief);
  if (!created.ok) throw new Error("no se creó");
  id = created.id;
  await svc.chooseIdea(userId, id, { ideaId: "A" });
  await svc.saveAnswers(userId, id, { narracion: "Una mesa con luz de ventana", herramienta: "gemini", aparece_creador: "no" });
  const content = svc.parseContent((await svc.getCarousel(userId, id))!.content)!;
  iaSlide = content.slides.find((s) => s.imagen.fuente === "ia" && s.imagen.prompt_ia)?.n ?? 0;
}, 60_000);

const withGemini = () => {
  vi.stubEnv("GEMINI_API_KEY", "g".repeat(30));
  vi.resetModules();
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("imágenes del carrusel creadas con IA", () => {
  it("el prompt lleva el estilo común, la zona de texto y la regla de no escribir texto", async () => {
    withGemini();
    const svc = await import("@/lib/carousel/service");
    const { buildImagePrompt } = await import("@/lib/carousel/ai-images");
    const c = svc.parseContent((await svc.getCarousel(userId, id))!.content)!;
    const s = c.slides.find((x) => x.n === iaSlide)!;
    const p = buildImagePrompt(c, s, "no");
    expect(p).toContain(s.imagen.prompt_ia!);
    expect(p).toMatch(/4:5/);
    expect(p).toMatch(/NO escribas texto/);
    expect(p).toMatch(/No incluyas personas/);
  });

  it("crea la imagen de un slide, la coloca sola y la cuenta para el cupo del mes", async () => {
    expect(iaSlide).toBeGreaterThan(0);
    withGemini();
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      calls.push(url);
      expect(JSON.parse(init.body).generationConfig.imageConfig.aspectRatio).toBe("4:5");
      return geminiImage(png);
    });
    const svc = await import("@/lib/carousel/service");
    const ai = await import("@/lib/carousel/ai-images");
    const before = await ai.imageQuota(userId);
    expect(before).toMatchObject({ enabled: true, used: 0 });
    expect((await ai.generateSlideImage(userId, id, iaSlide)).ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/gemini-2\.5-flash-image/);
    expect(Object.keys(svc.parseImages((await svc.getCarousel(userId, id))!.images))).toContain(String(iaSlide));
    expect((await ai.imageQuota(userId)).used).toBe(1);
  }, 30_000);

  it("crea las que faltan con el mismo método y avisa claro si Gemini no devuelve imagen", async () => {
    withGemini();
    const ai = await import("@/lib/carousel/ai-images");
    vi.stubGlobal("fetch", async () => geminiImage(png));
    const all = await ai.generateAllImages(userId, id);
    // Si no faltaba ninguna más, lo dice; si faltaban, las crea todas.
    expect(all.ok || /No falta ninguna/.test(all.ok ? "" : all.error)).toBe(true);

    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] }), { status: 200 }));
    const r = await ai.generateSlideImage(userId, id, iaSlide);
    expect(!r.ok && r.error).toMatch(/no devolvió una imagen/);
  }, 30_000);

  it("sin cupo no llama a Gemini", async () => {
    withGemini();
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => (calls.push(url), geminiImage(png)));
    const { setSetting } = await import("@/lib/settings");
    await setSetting("admin_limits", { aiImagesMonthlyBasico: 1, aiImagesMonthlyPro: 1 }, userId);
    const ai = await import("@/lib/carousel/ai-images");
    const r = await ai.generateSlideImage(userId, id, iaSlide);
    expect(!r.ok && r.error).toMatch(/Ya usaste/);
    expect(calls).toHaveLength(0);
  }, 30_000);
});
