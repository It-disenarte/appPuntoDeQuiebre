import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let adminId = "";
const out = z.object({ ok: z.boolean() });

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "adm@x.com", name: "Adm", passwordHash: "x", role: "admin" }).returning();
  adminId = u!.id;
}, 30_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const keys = () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-" + "x".repeat(30));
  vi.stubEnv("GEMINI_API_KEY", "g".repeat(30));
};

describe("modelos de IA configurables desde el admin", () => {
  it("sin configurar se usan los valores de fábrica (variables de entorno) y el reparto por defecto", async () => {
    const { getModels, SKILL_ROUTES } = await import("@/lib/admin/models");
    const m = await getModels();
    expect(m.claude).toBe("claude-sonnet-5-5");
    expect(m.geminiImage).toBe("gemini-2.5-flash-image");
    expect(m.geminiImagePro).toBe("");
    expect(m.routing.carruseles).toBe("gemini");
    expect(m.routing.brujula).toBe("claude");
    expect(Object.keys(m.routing)).toHaveLength(SKILL_ROUTES.length);
  });

  it("guarda, valida los nombres y lo guardado manda sobre lo de fábrica", async () => {
    const { getModels, saveModels, defaultModels } = await import("@/lib/admin/models");
    const base = defaultModels();
    const bad = await saveModels({ ...base, claude: "modelo con espacios" }, adminId);
    expect(bad.ok).toBe(false);
    const ok = await saveModels({ ...base, claude: "claude-opus-5-5", geminiImagePro: "gemini-3-pro-image-preview", routing: { ...base.routing, brujula: "gemini" } }, adminId);
    expect(ok.ok).toBe(true);
    const m = await getModels();
    expect(m).toMatchObject({ claude: "claude-opus-5-5", geminiImagePro: "gemini-3-pro-image-preview" });
    expect(m.routing.brujula).toBe("gemini");
    expect(m.routing.carruseles).toBe("gemini"); // lo que no se tocó sigue igual
  });

  it("el reparto guardado cambia qué IA se prueba primero y el modelo de Claude llega a la llamada", async () => {
    keys();
    const { saveModels, defaultModels } = await import("@/lib/admin/models");
    const base = defaultModels();
    await saveModels({ ...base, claude: "claude-modelo-prueba", routing: { ...base.routing, edicion: "gemini", carruseles: "claude" } }, adminId);
    const { providersFor } = await import("@/lib/skills");
    expect(await providersFor("edicion")).toEqual(["gemini", "claude"]);
    expect(await providersFor("carruseles")).toEqual(["claude", "gemini"]);

    const seen: { url: string; model?: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      seen.push({ url, model: JSON.parse(init.body).model });
      return url.includes("anthropic")
        ? new Response(JSON.stringify({ content: [{ type: "text", text: '{"ok": true}' }], stop_reason: "end_turn" }), { status: 200 })
        : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok": true}' }] } }] }), { status: 200 });
    });
    // La carruseles ahora va primero a Claude, con el modelo que puso el admin.
    const { runCarrusel } = await import("@/lib/skills");
    await runCarrusel(adminId, {}, out, () => ({ ok: false }));
    expect(seen[0]).toMatchObject({ model: "claude-modelo-prueba" });
  }, 30_000);

  it("las imágenes del plan Pro usan su modelo propio y el Básico el general", async () => {
    keys();
    const { saveModels, defaultModels } = await import("@/lib/admin/models");
    const base = defaultModels();
    await saveModels({ ...base, geminiImage: "img-basico", geminiImagePro: "img-pro" }, adminId);
    const urls: string[] = [];
    const png = await (await import("sharp")).default({ create: { width: 32, height: 40, channels: 3, background: "#f60" } }).png().toBuffer();
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: png.toString("base64") } }] } }] }), { status: 200 });
    });
    const { geminiGenerateImage } = await import("@/lib/ai/gemini");
    await geminiGenerateImage("x");
    await geminiGenerateImage("x", { model: "img-pro" });
    expect(urls[0]).toContain("/models/img-basico:");
    expect(urls[1]).toContain("/models/img-pro:");
  });
});
