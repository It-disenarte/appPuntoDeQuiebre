import "server-only";
import { readFile } from "node:fs/promises";
import { jsonrepair } from "jsonrepair";
import path from "node:path";
import type { ZodType } from "zod";
import { db } from "@/lib/db";
import { aiCalls } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { mockApplyAdjustment, mockBrujulaV2, mockPerfilVozV1, type BrujulaInput, type PerfilVozInput } from "./mock";
import { mockKitFinal, mockKitRound, type KitInput } from "@/lib/kit/mock";
import { mockHistorias, mockParrilla, mockTextos, type HistoriasInput, type ParrillaInput, type TextosInput } from "@/lib/plan/mock";
import { finalKitSchema, fontRoundSchema, paletteRoundSchema, titleRoundSchema, type FinalKit, type FontOption, type PaletteOption, type TitleOption } from "@/lib/kit/schemas";
import { transcribeWithGemini } from "./transcribe";
import { brujulaV2Output, historiasV2Output, parrillaV1Output, perfilVozV1Output, textosV2Output, type BrujulaV2, type HistoriasV2, type ParrillaV1, type PerfilVozV1, type TextosV2 } from "./schemas";

/**
 * Ejecutor de skills. Cada skill es un archivo versionado (skills/<nombre>/v<N>/skill.md) que se manda a Claude como
 * system prompt, con la entrada JSON como mensaje; la salida se valida con el esquema de Mishell antes de guardarse.
 * Sin ANTHROPIC_API_KEY se usa la versión de PRUEBA (reglas) y el resultado queda marcado `mock: true`.
 * Cada llamada se registra en ai_calls.
 */
export const SKILLS = {
  brujula: { dir: "brujula/v2", version: "brujula-v2" },
  perfilVoz: { dir: "perfil-voz/v1", version: "perfil-voz-v1" },
  kitVisual: { dir: "kit-visual/v1", version: "kit-visual-v1" },
  parrilla: { dir: "parrilla-guiones/v1", version: "parrilla-guiones-v1" },
  textos: { dir: "textos-publicacion/v2", version: "textos-publicacion-v2" },
  historias: { dir: "ideas-historias/v3", version: "ideas-historias-v3" },
  carruseles: { dir: "carruseles/v2", version: "carruseles-v2" },
  perfil: { dir: "optimizacion-perfil/v1", version: "optimizacion-perfil-v1" },
  directos: { dir: "guia-lives/v2", version: "guia-lives-v2" },
  tendencias: { dir: "tendencias/v2", version: "tendencias-v2" },
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
  if (start === -1) throw new Error("La respuesta no trae JSON");
  const end = body.lastIndexOf("}");
  // Si la salida se cortó antes de cerrar el JSON, se intenta cerrar lo que llegó (el esquema decide si alcanza).
  const text = end > start ? body.slice(start, end + 1) : body.slice(start);
  try {
    return JSON.parse(text);
  } catch {
    // El modelo a veces deja una coma o una comilla suelta; se repara sin gastar otra llamada.
    return JSON.parse(jsonrepair(text));
  }
}

type AnthropicResponse = { content?: { type: string; text?: string }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };

async function callClaude(key: SkillKey, input: unknown): Promise<{ raw: string; inputTokens?: number; outputTokens?: number; stopReason?: string }> {
  const e = env();
  const system = await readFile(path.join(process.cwd(), "skills", SKILLS[key].dir, "skill.md"), "utf8");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": e.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: e.SKILLS_MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: `Entrada:\n${JSON.stringify(input)}\n\nResponde solo con el JSON de salida.` }],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    throw new Error(`Anthropic respondió ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as AnthropicResponse;
  const raw = data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
  if (data.stop_reason === "max_tokens") console.error(`[skills] ${key}: la respuesta se cortó por límite de tokens (${data.usage?.output_tokens})`);
  return { raw, inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens, stopReason: data.stop_reason };
}

async function run<T>(userId: string, key: SkillKey, input: unknown, schema: ZodType<T>, mock: () => unknown): Promise<SkillResult<T>> {
  const skillVersion = SKILLS[key].version;
  if (!aiConfigured()) {
    const output = schema.parse(mock());
    await logCall(userId, key, { mock: true, status: "ok" });
    return { output, mock: true, skillVersion };
  }
  try {
    let res = await callClaude(key, input);
    let json: unknown;
    try {
      json = extractJson(res.raw);
    } catch {
      // Una sola repetición si el JSON vino roto y no se pudo reparar (salida cortada o mal formada).
      console.error(`[skills] ${key}: JSON no válido (motivo de fin: ${res.stopReason}, ${res.raw.length} caracteres), se repite la llamada una vez. Final: ${res.raw.slice(-160)}`);
      res = await callClaude(key, input);
      try {
        json = extractJson(res.raw);
      } catch (err) {
        console.error(`[skills] ${key}: la respuesta sigue sin JSON válido (motivo de fin: ${res.stopReason}, ${res.raw.length} caracteres). Final: ${res.raw.slice(-160)}`);
        throw err;
      }
    }
    const { inputTokens, outputTokens } = res;
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      console.error(`[skills] ${key}: la salida no cumple el esquema:`, JSON.stringify(parsed.error.issues.slice(0, 6).map((i) => ({ ruta: i.path.join("."), mensaje: i.message }))));
      throw new Error(`La salida de ${key} no cumple el esquema`);
    }
    await logCall(userId, key, { mock: false, status: "ok", inputTokens, outputTokens });
    return { output: parsed.data, mock: false, skillVersion };
  } catch (err) {
    console.error(`[skills] ${key} falló:`, err instanceof Error ? err.message : err);
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

/** Parrilla semanal: tema y guion de cada espacio (el reparto lo decide el código). */
export const runParrilla = (userId: string, input: ParrillaInput) => run<ParrillaV1>(userId, "parrilla", input, parrillaV1Output as ZodType<ParrillaV1>, () => mockParrilla(input));

/** Textos de publicación por red para una pieza. */
export const runTextos = (userId: string, input: TextosInput) => run<TextosV2>(userId, "textos", input, textosV2Output as ZodType<TextosV2>, () => mockTextos(input));

/** Ideas de historias de la semana. */
export const runHistorias = (userId: string, input: HistoriasInput) => run<HistoriasV2>(userId, "historias", input, historiasV2Output as ZodType<HistoriasV2>, () => mockHistorias(input));

/** Carruseles (skill 8): cada modo (ideas, entrevista_ia, carrusel, slide) trae su esquema y su respuesta de prueba. */
export const runCarrusel = <T,>(userId: string, input: unknown, schema: ZodType<T>, mock: () => unknown) => run<T>(userId, "carruseles", input, schema, mock);

/** Optimización del perfil de Instagram (skill 4). */
export const runPerfil = <T,>(userId: string, input: unknown, schema: ZodType<T>, mock: () => unknown) => run<T>(userId, "perfil", input, schema, mock);

/** Guía de directos (skill 15). */
export const runDirectos = <T,>(userId: string, input: unknown, schema: ZodType<T>, mock: () => unknown) => run<T>(userId, "directos", input, schema, mock);

/** Tendencias (skill 12). */
export const runTendencias = <T,>(userId: string, input: unknown, schema: ZodType<T>, mock: () => unknown) => run<T>(userId, "tendencias", input, schema, mock);

/** Una ronda del kit visual (modo "ronda"): devuelve las opciones sin filtrar; quien llama aplica las validaciones por código. */
export async function runKitRound(userId: string, input: KitInput): Promise<SkillResult<{ options: PaletteOption[] | FontOption[] | TitleOption[] }>> {
  const schema = input.numero_ronda <= 2 ? paletteRoundSchema : input.numero_ronda === 3 ? fontRoundSchema : titleRoundSchema;
  const r = await run<{ opciones: unknown[] }>(userId, "kitVisual", input, schema as unknown as ZodType<{ opciones: unknown[] }>, () => ({
    skill_version: "kit-visual-v1",
    ronda: input.numero_ronda,
    opciones: mockKitRound(input),
  }));
  return { ...r, output: { options: r.output.opciones as PaletteOption[] } };
}

/** El kit completo (modo "final"). `previous` es el kit anterior: al recalificar solo se ajustan las piezas con 👎. */
export const runKitFinal = (userId: string, input: KitInput, previous: FinalKit | null) =>
  run<FinalKit>(userId, "kitVisual", { ...input, kit_actual: previous }, finalKitSchema as unknown as ZodType<FinalKit>, () => mockKitFinal(input, previous));

/**
 * Transcripción de una grabación. Con GEMINI_API_KEY usa Gemini; sin ella devuelve `text: null` (PRUEBA) para que
 * quien llama use el texto de ejemplo. Lanza NoSpeechError si el audio no trae voz.
 */
export async function transcribeAudio(input: { data: Buffer; mime: string; name: string }): Promise<{ text: string | null; mock: boolean }> {
  if (!env().GEMINI_API_KEY) return { text: null, mock: true };
  return { text: await transcribeWithGemini(input), mock: false };
}

export { NoSpeechError } from "./transcribe";
