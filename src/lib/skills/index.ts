import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ZodType } from "zod";
import { db } from "@/lib/db";
import { aiCalls } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { mockApplyAdjustment, mockBrujulaV2, mockPerfilVozV1, type BrujulaInput, type PerfilVozInput } from "./mock";
import { brujulaV2Output, perfilVozV1Output, type BrujulaV2, type PerfilVozV1 } from "./schemas";

/**
 * Ejecutor de skills. Cada skill es un archivo versionado (skills/<nombre>/v<N>/skill.md) que se manda a Claude como
 * system prompt, con la entrada JSON como mensaje; la salida se valida con el esquema de Mishell antes de guardarse.
 * Sin ANTHROPIC_API_KEY se usa la versión de PRUEBA (reglas) y el resultado queda marcado `mock: true`.
 * Cada llamada se registra en ai_calls.
 */
export const SKILLS = {
  brujula: { dir: "brujula/v2", version: "brujula-v2" },
  perfilVoz: { dir: "perfil-voz/v1", version: "perfil-voz-v1" },
} as const;
type SkillKey = keyof typeof SKILLS;

export type SkillResult<T> = { output: T; mock: boolean; skillVersion: string };

export const aiConfigured = () => Boolean(env().ANTHROPIC_API_KEY);

async function logCall(userId: string, key: SkillKey, r: { mock: boolean; status: "ok" | "error"; inputTokens?: number; outputTokens?: number }) {
  await db()
    .insert(aiCalls)
    .values({ userId, skill: key, skillVersion: SKILLS[key].version, mock: r.mock, status: r.status, costCents: 0, inputTokens: r.inputTokens ?? null, outputTokens: r.outputTokens ?? null })
    .catch((err) => console.error("[skills] no se pudo registrar la llamada", err));
}

/** Saca el JSON de la respuesta del modelo (tolera que lo envuelva en ```json). */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("La respuesta no trae JSON");
  return JSON.parse(body.slice(start, end + 1));
}

type AnthropicResponse = { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };

async function callClaude(key: SkillKey, input: unknown): Promise<{ raw: string; inputTokens?: number; outputTokens?: number }> {
  const e = env();
  const system = await readFile(path.join(process.cwd(), "skills", SKILLS[key].dir, "skill.md"), "utf8");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": e.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: e.SKILLS_MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: `Entrada:\n${JSON.stringify(input)}\n\nResponde solo con el JSON de salida.` }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Anthropic respondió ${res.status}`);
  const data = (await res.json()) as AnthropicResponse;
  const raw = data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
  return { raw, inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens };
}

async function run<T>(userId: string, key: SkillKey, input: unknown, schema: ZodType<T>, mock: () => unknown): Promise<SkillResult<T>> {
  const skillVersion = SKILLS[key].version;
  if (!aiConfigured()) {
    const output = schema.parse(mock());
    await logCall(userId, key, { mock: true, status: "ok" });
    return { output, mock: true, skillVersion };
  }
  try {
    const { raw, inputTokens, outputTokens } = await callClaude(key, input);
    const output = schema.parse(extractJson(raw));
    await logCall(userId, key, { mock: false, status: "ok", inputTokens, outputTokens });
    return { output, mock: false, skillVersion };
  } catch (err) {
    await logCall(userId, key, { mock: false, status: "error" });
    throw err;
  }
}

export const runBrujula = (userId: string, input: BrujulaInput) =>
  run<BrujulaV2>(userId, "brujula", input, brujulaV2Output as ZodType<BrujulaV2>, () =>
    input.ajuste ? mockApplyAdjustment(input.ajuste.manual_actual as BrujulaV2, input.ajuste.seccion, input.ajuste.nota) : mockBrujulaV2(input),
  );

export const runPerfilVoz = (userId: string, input: PerfilVozInput, durationSeconds: number | null) =>
  run<PerfilVozV1>(userId, "perfilVoz", input, perfilVozV1Output as ZodType<PerfilVozV1>, () => mockPerfilVozV1(input, durationSeconds));

/** Transcripción de una grabación. PRUEBA: el servicio real (Gemini) aún no está conectado; devuelve `null` para que quien llama use el texto de ejemplo. */
export async function transcribeAudio(): Promise<{ text: string | null; mock: true }> {
  return { text: null, mock: true };
}
