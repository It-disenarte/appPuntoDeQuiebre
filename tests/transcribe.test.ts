import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const KEY = "AIza" + "x".repeat(30);

type Mod = typeof import("@/lib/skills/transcribe");
let mod: Mod;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  process.env.GEMINI_API_KEY = KEY;
  process.env.GEMINI_MODEL = "gemini-test";
  mod = await import("@/lib/skills/transcribe");
});
afterEach(() => vi.unstubAllGlobals());

const reply = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const input = { data: Buffer.from("audio"), mime: "audio/webm", name: "Ana Ruiz", brand: "Plombito" };

describe("transcripción con Gemini", () => {
  it("envía el audio en base64, la llave en el encabezado y el contexto de nombres", async () => {
    const fetchMock = reply({ candidates: [{ content: { parts: [{ text: "Hola, soy Ana de Plombito." }] } }] });
    vi.stubGlobal("fetch", fetchMock);
    const text = await mod.transcribeWithGemini(input);
    expect(text).toBe("Hola, soy Ana de Plombito.");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/models/gemini-test:generateContent");
    expect(String(url)).not.toContain(KEY); // la llave nunca va en la URL
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[1].inline_data).toEqual({ mime_type: "audio/webm", data: Buffer.from("audio").toString("base64") });
    expect(body.contents[0].parts[0].text).toMatch(/Ana Ruiz y la marca Plombito/);
  });
  it("sin voz lanza NoSpeechError", async () => {
    vi.stubGlobal("fetch", reply({ candidates: [{ content: { parts: [{ text: "[SIN_VOZ]" }] } }] }));
    await expect(mod.transcribeWithGemini(input)).rejects.toBeInstanceOf(mod.NoSpeechError);
    vi.stubGlobal("fetch", reply({ candidates: [] }));
    await expect(mod.transcribeWithGemini(input)).rejects.toBeInstanceOf(mod.NoSpeechError);
  });
  it("un error HTTP incluye el detalle pero no la llave", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":{"message":"Unsupported MIME type"}}', { status: 400 })));
    const err = await mod.transcribeWithGemini(input).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/Gemini respondió 400.*Unsupported MIME type/);
    expect((err as Error).message).not.toContain(KEY);
  });
});
