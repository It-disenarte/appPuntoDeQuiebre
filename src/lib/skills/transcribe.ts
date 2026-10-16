import "server-only";
import { env } from "@/lib/env";

export class NoSpeechError extends Error {
  constructor() {
    super("No se escuchó voz en el audio");
  }
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
};

const NO_SPEECH = "[SIN_VOZ]";

/** Instrucciones de transcripción. Recibe el nombre del creador y de su marca para escribirlos bien (caso "Plombito"). */
export function transcriptionPrompt(ctx: { name: string; brand?: string | null }): string {
  const names = [ctx.name, ctx.brand].filter(Boolean).join(" y la marca ");
  return [
    "Transcribe fielmente este audio en español de México.",
    `Contexto: quien habla se llama ${names}. Si menciona su nombre o el de su marca, escríbelos tal cual.`,
    "Escribe solo lo que se dice, con puntuación natural. No resumas, no corrijas ni agregues comentarios ni encabezados.",
    `Si no hay voz humana audible, responde exactamente: ${NO_SPEECH}`,
  ].join("\n");
}

/** Transcribe un audio con Gemini (inline, hasta ~8 MB). Lanza NoSpeechError si no hay voz. */
export async function transcribeWithGemini(input: { data: Buffer; mime: string; name: string; brand?: string | null }): Promise<string> {
  const e = env();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(e.GEMINI_MODEL)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": e.GEMINI_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: transcriptionPrompt(input) }, { inline_data: { mime_type: input.mime, data: input.data.toString("base64") } }] }],
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    throw new Error(`Gemini respondió ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as GeminiResponse;
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text || text.includes(NO_SPEECH)) throw new NoSpeechError();
  return text;
}
