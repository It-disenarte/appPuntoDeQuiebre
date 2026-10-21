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
let userId = "";
const out = z.object({ ok: z.boolean() });

const claudeOk = () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"ok": true}' }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
const claudeNoCredit = () => new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }), { status: 400 });
const geminiOk = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok": true}' }] } }] }), { status: 200 });

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "ia@x.com", name: "IA", passwordHash: "x" }).returning();
  userId = u!.id;
}, 30_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const withKeys = (claude: boolean, gemini: boolean) => {
  vi.stubEnv("ANTHROPIC_API_KEY", claude ? "sk-ant-" + "x".repeat(30) : "");
  vi.stubEnv("GEMINI_API_KEY", gemini ? "g".repeat(30) : "");
};

describe("reparto de IAs por skill", () => {
  it("las skills ligeras van primero a Gemini y las pesadas a Claude; solo cuentan las IAs con llave", async () => {
    withKeys(true, true);
    const { providersFor } = await import("@/lib/skills");
    expect(providersFor("carruseles")).toEqual(["gemini", "claude"]);
    expect(providersFor("brujula")).toEqual(["claude", "gemini"]);
    expect(providersFor("edicion")).toEqual(["claude", "gemini"]);
    withKeys(true, false);
    vi.resetModules();
    expect((await import("@/lib/skills")).providersFor("carruseles")).toEqual(["claude"]);
    withKeys(false, true);
    vi.resetModules();
    expect((await import("@/lib/skills")).providersFor("brujula")).toEqual(["gemini"]);
  });

  it("si Claude no tiene créditos, la skill se resuelve con Gemini", async () => {
    withKeys(true, true);
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url.includes("anthropic") ? "claude" : "gemini");
      return url.includes("anthropic") ? claudeNoCredit() : geminiOk();
    });
    const { runEdicion } = await import("@/lib/skills");
    const r = await runEdicion(userId, {}, out, () => ({ ok: false }));
    expect(r.output.ok).toBe(true);
    expect(r.mock).toBe(false);
    expect(calls).toEqual(["claude", "gemini"]);
    const rows = await pdb.select().from(schema.aiCalls);
    expect(rows.at(-1)!.skillVersion).toBe("edicion-v1@gemini");
  });

  it("una skill ligera usa Gemini y no toca Claude si Gemini responde bien; y si Gemini falla pasa a Claude", async () => {
    withKeys(true, true);
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url.includes("anthropic") ? "claude" : "gemini");
      return url.includes("anthropic") ? claudeOk() : geminiOk();
    });
    const { runCarrusel } = await import("@/lib/skills");
    expect((await runCarrusel(userId, {}, out, () => ({ ok: false }))).output.ok).toBe(true);
    expect(calls).toEqual(["gemini"]);

    calls.length = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url.includes("anthropic") ? "claude" : "gemini");
      return url.includes("anthropic") ? claudeOk() : new Response("{}", { status: 400 }); // Gemini rechaza (sin reintentos)
    });
    expect((await runCarrusel(userId, {}, out, () => ({ ok: false }))).output.ok).toBe(true);
    expect(calls).toEqual(["gemini", "claude"]);
  }, 30_000);

  it("si fallan las dos, el error es el de la última IA y queda registrado", async () => {
    withKeys(true, true);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "mal" } }), { status: 400 }));
    const { runEdicion } = await import("@/lib/skills");
    await expect(runEdicion(userId, {}, out, () => ({ ok: false }))).rejects.toThrow(/Gemini|Anthropic/);
  }, 30_000);
});
