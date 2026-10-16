import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { audit } from "@/lib/audit";
import { isSameOrigin } from "@/lib/auth/dal";
import { getApiCreator } from "@/lib/auth/gates";
import { getStep, MAX_STEP_SECONDS, STORY_CHOICE_VALUES } from "@/lib/brujula/content";
import { intakeProgress, getIntake, saveStep } from "@/lib/brujula/service";
import { MOCK_STORY, VOICE_MAX_BYTES } from "@/lib/brujula/voice";
import { HOUR, rateLimit } from "@/lib/rate";
import { getClientIp } from "@/lib/request";
import { NoSpeechError, transcribeAudio } from "@/lib/skills";
import { deleteObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { AUDIO_TYPES, matchesAudioSignature } from "@/lib/video-signature";

export const dynamic = "force-dynamic";

/**
 * Respuesta por voz de un paso de "Tu historia". Se valida el formato por contenido, se transcribe y se guarda SOLO el texto:
 * el audio se borra al terminar (política de la guía de Luis).
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getApiCreator();
  if (!user) return Response.json({ error: "Inicia sesión con una cuenta activa." }, { status: 401 });
  if (!(await rateLimit(`voz:user:${user.id}`, 40, HOUR))) return Response.json({ error: "Demasiados intentos. Intenta más tarde." }, { status: 429 });

  const url = new URL(request.url);
  const step = getStep(url.searchParams.get("paso") ?? "");
  if (!step || step.kind !== "voz") return Response.json({ error: "Ese paso no existe." }, { status: 400 });
  const seconds = Number(url.searchParams.get("segundos"));
  const insisted = url.searchParams.get("insistir") === "1";
  const minSeconds = insisted ? 10 : step.minSeconds;
  if (!Number.isFinite(seconds) || seconds < minSeconds) return Response.json({ error: `Cuéntanos un poco más: faltan ${Math.max(0, Math.ceil(minSeconds - (Number.isFinite(seconds) ? seconds : 0)))} segundos.` }, { status: 400 });
  if (seconds > MAX_STEP_SECONDS + 15) return Response.json({ error: "La grabación es demasiado larga." }, { status: 400 });

  let choice: (typeof STORY_CHOICE_VALUES)[number] | undefined;
  if (step.id === "historia") {
    const c = url.searchParams.get("eleccion") ?? "";
    if (!(STORY_CHOICE_VALUES as readonly string[]).includes(c)) return Response.json({ error: "Elige primero cuál historia vas a contar." }, { status: 400 });
    choice = c as typeof choice;
  }

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = AUDIO_TYPES[contentType];
  if (!ext) return Response.json({ error: "Formato de audio no compatible." }, { status: 415 });
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0 || declared > VOICE_MAX_BYTES) return Response.json({ error: "El audio es demasiado pesado." }, { status: 413 });

  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0 || data.length > VOICE_MAX_BYTES) return Response.json({ error: "El audio es demasiado pesado." }, { status: 413 });
  if (!matchesAudioSignature(data.subarray(0, 12), contentType)) return Response.json({ error: "El archivo no parece un audio válido." }, { status: 415 });

  // El audio vive en MinIO solo mientras se transcribe y se borra siempre al terminar.
  const key = `voz/${user.id}/${randomUUID()}.${ext}`;
  const stored = storageConfigured();
  try {
    if (stored) await putObjectStream(key, Readable.from(data), contentType);
    const transcription = await transcribeAudio({ data, mime: contentType, name: user.name });
    const text = transcription.text ?? MOCK_STORY[step.id as keyof typeof MOCK_STORY];
    await saveStep(user.id, step.id, { text, source: "audio", seconds: Math.round(seconds), mock: transcription.mock }, choice);
    await audit({ action: "brujula.voice_saved", actorUserId: user.id, ip: await getClientIp(), meta: { paso: step.id, seconds: Math.round(seconds), mock: transcription.mock } });
    const p = intakeProgress(await getIntake(user.id));
    return Response.json({ ok: true, mock: transcription.mock, next: p.nextStep ? `/mi-marca/historia/${p.nextStep}` : "/mi-marca/historia/elecciones" });
  } catch (err) {
    if (err instanceof NoSpeechError) {
      return Response.json({ error: "No alcanzamos a escuchar tu voz. Revisa tu micrófono e inténtalo de nuevo, o escribe tu respuesta." }, { status: 422 });
    }
    console.error("[historia] no se pudo procesar el audio", err instanceof Error ? err.message : err);
    return Response.json({ error: "No se pudo procesar tu audio. Intenta de nuevo o escribe tu respuesta." }, { status: 500 });
  } finally {
    if (stored) await deleteObject(key).catch(() => undefined);
  }
}
