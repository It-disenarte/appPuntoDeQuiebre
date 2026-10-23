import "server-only";
import { geminiConfigured, geminiGenerate, geminiGenerateImage } from "@/lib/ai/gemini";
import { env } from "@/lib/env";

export type ModelKind = "claude" | "geminiText" | "geminiMedia" | "geminiImage" | "geminiImagePro";
export const MODEL_KINDS: ModelKind[] = ["claude", "geminiText", "geminiMedia", "geminiImage", "geminiImagePro"];

/** Prueba que un modelo existe y responde (una llamada mínima). Las de imagen cuestan unos centavos. */
export async function testModel(kind: ModelKind, model: string): Promise<{ ok: true; ms: number; note: string } | { ok: false; error: string }> {
  const t0 = Date.now();
  try {
    if (kind === "claude") {
      const key = env().ANTHROPIC_API_KEY;
      if (!key) return { ok: false, error: "Falta ANTHROPIC_API_KEY." };
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: "user", content: "Responde solo: ok" }] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return { ok: false, error: `Anthropic respondió ${res.status}: ${(await res.text().catch(() => "")).slice(0, 220)}` };
      return { ok: true, ms: Date.now() - t0, note: "Responde bien." };
    }
    if (!geminiConfigured()) return { ok: false, error: "Falta GEMINI_API_KEY." };
    if (kind === "geminiImage" || kind === "geminiImagePro") {
      const img = await geminiGenerateImage("Un círculo azul liso sobre fondo blanco, sin texto.", { model, aspectRatio: "1:1", timeoutMs: 60_000 });
      return { ok: true, ms: Date.now() - t0, note: `Creó una imagen de prueba (${Math.round(img.data.length / 1024)} KB).` };
    }
    const text = await geminiGenerate([{ text: "Responde solo: ok" }], { model, maxRetries: 1, timeoutMs: 30_000 });
    return { ok: true, ms: Date.now() - t0, note: text ? "Responde bien." : "Respondió vacío." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No respondió." };
  }
}

/** Los modelos de Gemini que tu llave puede usar para generar contenido (los nombres cambian y Google retira modelos viejos). */
export async function listGeminiModels(): Promise<{ ok: true; text: string[]; image: string[] } | { ok: false; error: string }> {
  const key = env().GEMINI_API_KEY;
  if (!key) return { ok: false, error: "Falta GEMINI_API_KEY." };
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { ok: false, error: `Google respondió ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
    const data = (await res.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
    const names = (data.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => (m.name ?? "").replace(/^models\//, "")).filter(Boolean);
    const image = names.filter((n) => /image/i.test(n));
    const text = names.filter((n) => /^gemini/i.test(n) && !/image|tts|embed|live|audio|robotics|computer-use|aqa/i.test(n));
    return { ok: true, text: [...new Set(text)].sort().reverse(), image: [...new Set(image)].sort().reverse() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No respondió." };
  }
}
