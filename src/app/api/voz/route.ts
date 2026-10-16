import { randomUUID } from "node:crypto";
import { audit } from "@/lib/audit";
import { isSameOrigin } from "@/lib/auth/dal";
import { getApiCreator } from "@/lib/auth/gates";
import { rebuildManual, saveVoice } from "@/lib/brujula/service";
import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS, VOICE_MIN_SECONDS, VOICE_TOPIC_VALUES } from "@/lib/brujula/voice";
import { HOUR, rateLimit } from "@/lib/rate";
import { getClientIp } from "@/lib/request";
import { runVoiceSkill, SKILL_VERSIONS, transcribeAudio } from "@/lib/skills";
import { deleteObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { AUDIO_TYPES, matchesAudioSignature } from "@/lib/video-signature";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

/**
 * Muestra de voz grabada en el teléfono. Se valida el formato por contenido, se transcribe y se calcula el perfil.
 * El audio se borra al terminar: solo se conservan la transcripción y el perfil.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getApiCreator();
  if (!user) return Response.json({ error: "Inicia sesión con una cuenta activa." }, { status: 401 });
  if (!(await rateLimit(`voz:user:${user.id}`, 8, HOUR))) return Response.json({ error: "Demasiados intentos. Intenta más tarde." }, { status: 429 });

  const url = new URL(request.url);
  const topic = url.searchParams.get("tema") ?? "";
  const seconds = Number(url.searchParams.get("segundos"));
  if (!(VOICE_TOPIC_VALUES as readonly string[]).includes(topic)) return Response.json({ error: "Elige un tema." }, { status: 400 });
  if (!Number.isFinite(seconds) || seconds < VOICE_MIN_SECONDS) {
    return Response.json({ error: `Graba al menos ${VOICE_MIN_SECONDS} segundos.` }, { status: 400 });
  }
  if (seconds > VOICE_MAX_SECONDS + 15) return Response.json({ error: "La grabación es demasiado larga." }, { status: 400 });

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = AUDIO_TYPES[contentType];
  if (!ext) return Response.json({ error: "Formato de audio no compatible." }, { status: 415 });
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0 || declared > VOICE_MAX_BYTES) return Response.json({ error: "El audio es demasiado pesado." }, { status: 413 });

  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0 || data.length > VOICE_MAX_BYTES) return Response.json({ error: "El audio es demasiado pesado." }, { status: 413 });
  if (!matchesAudioSignature(data.subarray(0, 12), contentType)) return Response.json({ error: "El archivo no parece un audio válido." }, { status: 415 });

  // El audio se guarda solo mientras se transcribe y se borra siempre al terminar.
  const key = `voz/${user.id}/${randomUUID()}.${ext}`;
  const stored = storageConfigured();
  try {
    if (stored) await putObjectStream(key, Readable.from(data), contentType);
    const { text, mock } = await transcribeAudio();
    const profile = await runVoiceSkill(user.id, text, Math.round(seconds));
    await saveVoice(user.id, { topic, source: "audio", transcript: text, durationSeconds: Math.round(seconds), profile, mock });
    await rebuildManual(user.id, { regenerateCreative: false });
    await audit({ action: "brujula.voice_saved", actorUserId: user.id, ip: await getClientIp(), meta: { source: "audio", seconds: Math.round(seconds), mock, skill: SKILL_VERSIONS.voz } });
    return Response.json({ ok: true, mock });
  } catch (err) {
    console.error("[voz] no se pudo procesar la muestra", err);
    return Response.json({ error: "No se pudo procesar tu audio. Intenta de nuevo." }, { status: 500 });
  } finally {
    if (stored) await deleteObject(key).catch(() => undefined);
  }
}
