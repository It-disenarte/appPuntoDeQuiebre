import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: () => ({}) }));

const broken = 'Aquí va:\n```json\n{ "a": ["uno" "dos"], "b": ["x"\n  {"y": 1}], "c": 1, }\n```';

describe("JSON de la IA", () => {
  it("repara comas faltantes y sobrantes que a veces deja el modelo", async () => {
    process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
    process.env.APP_URL = "https://app.example.com";
    const { extractJson } = await import("@/lib/skills");
    const { parseJson } = await import("@/lib/ai/gemini");
    expect((extractJson(broken) as { c: number }).c).toBe(1);
    expect((parseJson(broken) as { c: number }).c).toBe(1);
  }, 30_000);
  it("sigue fallando si no hay JSON", async () => {
    const { extractJson } = await import("@/lib/skills");
    expect(() => extractJson("sin json")).toThrow();
  }, 30_000);
});
