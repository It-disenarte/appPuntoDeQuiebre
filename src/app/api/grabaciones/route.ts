import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { isSameOrigin } from "@/lib/auth/dal";
import { getApiCreator } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { baseType, isPart, MAX_PART_BYTES, MAX_PART_SECONDS, VIDEO_TYPES } from "@/lib/recording/rules";
import { commitRecording, ownsVideoPiece } from "@/lib/recording/service";
import { getClientIp } from "@/lib/request";
import { deleteObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { matchesVideoSignature, SIGNATURE_BYTES } from "@/lib/video-signature";

export const dynamic = "force-dynamic";

/**
 * Subida de una parte grabada. Excluida del proxy (src/proxy.ts) para que el cuerpo no se cargue en memoria:
 * aquí se valida sesión, dueña de la pieza, tipo por contenido y tamaño real mientras se transmite a MinIO.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getApiCreator();
  if (!user) return Response.json({ error: "Inicia sesión con una cuenta activa." }, { status: 401 });
  if (!storageConfigured()) return Response.json({ error: "El almacenamiento no está configurado." }, { status: 503 });
  if (!(await rateLimit(`grabar:user:${user.id}`, 60, HOUR))) return Response.json({ error: "Demasiadas subidas seguidas. Intenta en un rato." }, { status: 429 });

  const q = new URL(request.url).searchParams;
  const pieceId = z.string().uuid().safeParse(q.get("pieza") ?? "");
  const part = q.get("parte") ?? "";
  const seconds = Number(q.get("segundos"));
  if (!pieceId.success || !isPart(part) || !Number.isFinite(seconds) || seconds < 1 || seconds > MAX_PART_SECONDS) return Response.json({ error: "Datos de la grabación no válidos." }, { status: 400 });
  if (!(await ownsVideoPiece(user.id, pieceId.data))) return Response.json({ error: "Esa pieza no existe." }, { status: 404 });

  const contentType = baseType(request.headers.get("content-type") ?? "");
  const ext = VIDEO_TYPES[contentType];
  if (!ext) return Response.json({ error: "Formato de video no compatible." }, { status: 415 });
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return Response.json({ error: "Falta el tamaño del archivo." }, { status: 411 });
  if (declared > MAX_PART_BYTES) return Response.json({ error: "La grabación pesa demasiado." }, { status: 413 });
  if (!request.body) return Response.json({ error: "Archivo vacío." }, { status: 400 });

  let received = 0;
  let head: Buffer | null = Buffer.alloc(0);
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (received > MAX_PART_BYTES || received > declared) return cb(new Error("Tamaño excedido"));
      if (head) {
        head = Buffer.concat([head, chunk]);
        if (head.length < SIGNATURE_BYTES) return cb();
        if (!matchesVideoSignature(head, contentType)) return cb(new Error("Firma de video inválida"));
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

  const key = `grabaciones/${user.id}/${pieceId.data}/${part}-${randomUUID()}.${ext}`;
  try {
    await putObjectStream(key, body, contentType);
    const rec = await commitRecording({ userId: user.id, pieceId: pieceId.data, part, key, contentType, bytes: received, seconds: Math.round(seconds) });
    await audit({ action: "grabacion.subida", actorUserId: user.id, ip: await getClientIp(), meta: { pieza: pieceId.data, parte: part, bytes: received } });
    return Response.json({ ok: true, id: rec.id });
  } catch (err) {
    await deleteObject(key).catch(() => undefined);
    console.error("[grabaciones] no se pudo guardar", err instanceof Error ? err.message : err);
    return Response.json({ error: "No se pudo guardar tu video. Intenta de nuevo." }, { status: 500 });
  }
}
