import "server-only";
import { env } from "@/lib/env";

/**
 * Cliente mínimo de Gemini para tareas con imágenes y videos (capturas de métricas, análisis de reels de la competencia).
 * La llave va en el encabezado `x-goog-api-key` (nunca en la URL). Reintenta con espera creciente ante límites (429) y fallas del servicio.
 */
const BASE = "https://generativelanguage.googleapis.com";

export const geminiConfigured = () => Boolean(env().GEMINI_API_KEY);

export type GeminiPart = { text: string } | { inline: { mime: string; data: Buffer } } | { file: { uri: string; mime: string } };

const backoffMs = (attempt: number) => 2000 * 2 ** attempt + Math.floor(Math.random() * 400);

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function explain(status: number, body: string): string {
  const detail = body.slice(0, 300);
  if (status === 429) return `Gemini alcanzó su límite de uso (429). Intenta de nuevo más tarde. ${detail}`;
  if (status === 404) return `Gemini no encontró el modelo ${env().GEMINI_MODEL} (404). Cámbialo con GEMINI_MODEL. ${detail}`;
  if (status === 400 && /API key/i.test(body)) return "Gemini rechazó la llave (GEMINI_API_KEY).";
  return `Gemini respondió ${status}: ${detail}`;
}

/** Genera texto a partir de partes (texto, imágenes en línea o archivos subidos). */
export async function geminiGenerate(parts: GeminiPart[], opts: { json?: boolean; maxRetries?: number; timeoutMs?: number } = {}): Promise<string> {
  const e = env();
  const max = opts.maxRetries ?? 3;
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: parts.map((p) => ("text" in p ? { text: p.text } : "inline" in p ? { inline_data: { mime_type: p.inline.mime, data: p.inline.data.toString("base64") } } : { file_data: { file_uri: p.file.uri, mime_type: p.file.mime } })),
      },
    ],
    generationConfig: { temperature: 0.2, ...(opts.json ? { responseMimeType: "application/json" } : {}) },
  });
  let last: GeminiError | null = null;
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      const res = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(e.GEMINI_MODEL)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": e.GEMINI_API_KEY!, "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      }
      last = new GeminiError(explain(res.status, await res.text().catch(() => "")), res.status);
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      last = new GeminiError(err instanceof Error ? err.message : "Falló la conexión con Gemini", 0);
    }
    if (attempt < max - 1) await new Promise((r) => setTimeout(r, backoffMs(attempt)));
  }
  throw last ?? new GeminiError("Gemini falló", 0);
}

/** Sube un video al servicio de archivos de Gemini y espera a que esté listo para analizarse. */
export async function geminiUploadFile(data: Buffer, mime: string): Promise<{ uri: string; mime: string }> {
  const key = env().GEMINI_API_KEY!;
  const res = await fetch(`${BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "X-Goog-Upload-Command": "start, upload, finalize", "X-Goog-Upload-Header-Content-Length": String(data.length), "X-Goog-Upload-Header-Content-Type": mime, "Content-Type": mime },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new GeminiError(explain(res.status, await res.text().catch(() => "")), res.status);
  const json = (await res.json()) as { file: { name: string; uri: string; mimeType: string } };

  const start = Date.now();
  while (Date.now() - start < 120_000) {
    const st = await fetch(`${BASE}/v1beta/${json.file.name}`, { headers: { "x-goog-api-key": key } });
    if (st.ok) {
      const s = (await st.json()) as { state?: string };
      if (s.state === "ACTIVE") return { uri: json.file.uri, mime: json.file.mimeType };
      if (s.state === "FAILED") throw new GeminiError("Gemini no pudo procesar el video", 0);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new GeminiError("Gemini tardó demasiado en procesar el video", 0);
}

/** Saca el JSON de la respuesta (tolera que venga envuelto en ```json). */
export function parseJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? raw).trim();
  const a = body.indexOf("{");
  const b = body.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("La respuesta no trae JSON");
  return JSON.parse(body.slice(a, b + 1));
}
