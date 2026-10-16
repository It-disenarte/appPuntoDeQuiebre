import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { audit } from "@/lib/audit";
import { getApiUser, isSameOrigin } from "@/lib/auth/dal";
import { getClientIp } from "@/lib/request";
import { getSetting, setSetting, SETTING_KEYS, type WelcomeVideo } from "@/lib/settings";
import { deleteObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { matchesVideoSignature, SIGNATURE_BYTES } from "@/lib/video-signature";

export const dynamic = "force-dynamic";

/**
 * Subida del video de bienvenida (solo admin). Esta ruta está EXCLUIDA del proxy
 * (src/proxy.ts) para que el cuerpo no se cargue en memoria: aquí se valida todo.
 */
const MAX_BYTES = 500 * 1024 * 1024;
const TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getApiUser();
  if (!user || user.role !== "admin") return Response.json({ error: "No encontrado" }, { status: 404 });
  if (!storageConfigured()) return Response.json({ error: "El almacenamiento (MinIO) no está configurado." }, { status: 503 });

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = TYPES[contentType];
  if (!ext) return Response.json({ error: "Formato no permitido. Usa MP4, WebM o MOV." }, { status: 415 });
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return Response.json({ error: "Falta el tamaño del archivo." }, { status: 411 });
  if (declared > MAX_BYTES) return Response.json({ error: "El video supera 500 MB." }, { status: 413 });
  if (!request.body) return Response.json({ error: "Archivo vacío." }, { status: 400 });

  // Cuenta los bytes reales: corta si el cuerpo excede lo declarado o el máximo.
  // Además verifica que los primeros bytes sean de un video real (MP4/MOV/WebM).
  let received = 0;
  let head: Buffer | null = Buffer.alloc(0);
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (received > MAX_BYTES || received > declared) return cb(new Error("Tamaño excedido"));
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

  const key = `media/bienvenida/${randomUUID()}.${ext}`;
  try {
    await putObjectStream(key, body, contentType);
  } catch (err) {
    console.error("[media] subida fallida", err);
    await deleteObject(key).catch(() => undefined);
    return Response.json({ error: "No se pudo subir el video." }, { status: 500 });
  }

  const previous = await getSetting<WelcomeVideo>(SETTING_KEYS.welcomeVideo);
  const value: WelcomeVideo = { key, contentType, size: received, uploadedAt: new Date().toISOString() };
  await setSetting(SETTING_KEYS.welcomeVideo, value, user.id);
  if (previous?.key && previous.key !== key) await deleteObject(previous.key).catch(() => undefined);
  await audit({ action: "admin.welcome_video_uploaded", actorUserId: user.id, ip: await getClientIp(), meta: { size: received } });

  return Response.json({ ok: true, size: received });
}
