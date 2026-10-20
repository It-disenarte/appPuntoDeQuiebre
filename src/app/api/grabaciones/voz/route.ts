import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { isSameOrigin } from "@/lib/auth/dal";
import { getApiCreator } from "@/lib/auth/gates";
import { commitVoiceover, VO_MAX_AUDIO_BYTES, VO_MAX_SECONDS } from "@/lib/edit/voiceover";
import { editQuota } from "@/lib/edit/service";
import { getPiece } from "@/lib/plan/service";
import { HOUR, rateLimit } from "@/lib/rate";
import { baseType } from "@/lib/recording/rules";
import { getClientIp } from "@/lib/request";
import { deleteObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { AUDIO_TYPES, matchesAudioSignature, SIGNATURE_BYTES } from "@/lib/video-signature";

export const dynamic = "force-dynamic";

/** Sube la voz en off de una pieza (solo Pro). Excluida del proxy como las demás subidas: valida todo mientras transmite a MinIO. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getApiCreator();
  if (!user) return Response.json({ error: "Inicia sesión con una cuenta activa." }, { status: 401 });
  if (!storageConfigured()) return Response.json({ error: "El almacenamiento no está configurado." }, { status: 503 });
  if (!(await rateLimit(`voz-en-off:user:${user.id}`, 40, HOUR))) return Response.json({ error: "Demasiadas subidas seguidas. Intenta en un rato." }, { status: 429 });

  const q = new URL(request.url).searchParams;
  const pieceId = z.string().uuid().safeParse(q.get("pieza") ?? "");
  const seconds = Number(q.get("segundos"));
  if (!pieceId.success || !Number.isFinite(seconds) || seconds < 3) return Response.json({ error: "Tu voz es muy corta o los datos no son válidos." }, { status: 400 });
  if (seconds > VO_MAX_SECONDS + 5) return Response.json({ error: `La voz puede durar hasta ${VO_MAX_SECONDS / 60} minutos.` }, { status: 400 });
  if (!(await editQuota(user.id)).allowed) return Response.json({ error: "La edición es del plan Pro." }, { status: 403 });
  const piece = await getPiece(user.id, pieceId.data);
  if (!piece || piece.kind !== "video") return Response.json({ error: "Esa pieza no existe." }, { status: 404 });

  const contentType = baseType(request.headers.get("content-type") ?? "");
  const ext = AUDIO_TYPES[contentType];
  if (!ext) return Response.json({ error: "Formato de audio no compatible (usa M4A, MP3, WebM u OGG)." }, { status: 415 });
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return Response.json({ error: "Falta el tamaño del archivo." }, { status: 411 });
  if (declared > VO_MAX_AUDIO_BYTES) return Response.json({ error: "El audio pesa demasiado." }, { status: 413 });
  if (!request.body) return Response.json({ error: "Archivo vacío." }, { status: 400 });

  let received = 0;
  let head: Buffer | null = Buffer.alloc(0);
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (received > VO_MAX_AUDIO_BYTES || received > declared) return cb(new Error("Tamaño excedido"));
      if (head) {
        head = Buffer.concat([head, chunk]);
        if (head.length < SIGNATURE_BYTES) return cb();
        if (!matchesAudioSignature(head, contentType)) return cb(new Error("Firma de audio inválida"));
        const ready = head;
        head = null;
        return cb(null, ready);
      }
      cb(null, chunk);
    },
    flush(cb) {
      cb(head ? new Error("Archivo demasiado corto") : null);
    },
  });
  const body = Readable.fromWeb(request.body as unknown as NodeWebReadableStream).pipe(limiter);
  const key = `voces/${user.id}/${pieceId.data}/${randomUUID()}.${ext}`;
  try {
    await putObjectStream(key, body, contentType);
    const v = await commitVoiceover({ userId: user.id, pieceId: pieceId.data, key, contentType, bytes: received, seconds: Math.round(seconds) });
    await audit({ action: "grabacion.subida", actorUserId: user.id, ip: await getClientIp(), meta: { pieza: pieceId.data, voz_en_off: true, bytes: received } });
    return Response.json({ ok: true, id: v.id });
  } catch (err) {
    await deleteObject(key).catch(() => undefined);
    console.error("[voz-en-off] no se pudo guardar", err instanceof Error ? err.message : err);
    return Response.json({ error: "No se pudo guardar tu voz. Intenta de nuevo." }, { status: 500 });
  }
}
