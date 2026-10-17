import "server-only";
import { env } from "@/lib/env";

export const claudeConfigured = () => Boolean(env().ANTHROPIC_API_KEY);

/** Llamada simple a Claude (texto) con sistema y mensaje; devuelve el texto de la respuesta. */
export async function claudeText(system: string, user: string, opts: { maxTokens?: number; timeoutMs?: number } = {}): Promise<{ text: string; inputTokens?: number; outputTokens?: number }> {
  const e = env();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": e.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: e.SKILLS_MODEL, max_tokens: opts.maxTokens ?? 4000, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  if (!res.ok) throw new Error(`Anthropic respondió ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  return { text: (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""), inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens };
}
