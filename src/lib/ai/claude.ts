import "server-only";
import { getModels } from "@/lib/admin/models";
import { env } from "@/lib/env";

export const claudeConfigured = () => Boolean(env().ANTHROPIC_API_KEY);

/** Llamada simple a Claude (texto) con sistema y mensaje; devuelve el texto de la respuesta. */
export async function claudeText(system: string, user: string, opts: { maxTokens?: number; timeoutMs?: number } = {}): Promise<{ text: string; inputTokens?: number; outputTokens?: number; stopReason?: string }> {
  const e = env();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": e.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: (await getModels()).claude, max_tokens: opts.maxTokens ?? 4000, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  if (!res.ok) throw new Error(`Anthropic respondió ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  return { text: (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""), inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens, stopReason: data.stop_reason };
}

/** Llamada a Claude con fotogramas (imágenes JPEG) y un texto: la usa la edición cuando hay que “ver” los videos. */
export async function claudeWithImages(system: string, userText: string, images: Buffer[], opts: { maxTokens?: number; timeoutMs?: number } = {}): Promise<{ text: string; inputTokens?: number; outputTokens?: number; stopReason?: string }> {
  const e = env();
  const content = [
    ...images.slice(0, 60).map((b) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.toString("base64") } })),
    { type: "text", text: userText },
  ];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": e.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: (await getModels()).claude, max_tokens: opts.maxTokens ?? 12000, system, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 240_000),
  });
  if (!res.ok) throw new Error(`Anthropic respondió ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  return { text: (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""), inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens, stopReason: data.stop_reason };
}
