import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { isSameOrigin } from "@/lib/auth/dal";
import { getApiCreator } from "@/lib/auth/gates";
import { MAX_ZIP_BYTES } from "@/lib/carousel/animate";
import { animationQuota, openClip, requestAnimation, storeFrames, zipClips } from "@/lib/carousel/animate-service";
import { HOUR, rateLimit } from "@/lib/rate";
import { getClientIp } from "@/lib/request";
import { deleteObject, storageConfigured } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Clips animados del carrusel (solo su dueña). `?n=3` es el clip del slide 3 (acepta rangos para verlo en el navegador);
 * sin `n` y con `?descargar=1` baja todos en un ZIP. Con `n` y `descargar=1` baja ese clip como archivo.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiCreator();
  const id = z.string().uuid().safeParse((await params).id);
  if (!user || !id.success) return new Response(null, { status: 404 });
  const q = new URL(request.url).searchParams;
  const download = q.get("descargar") === "1";
  const n = z.coerce.number().int().min(1).max(12).safeParse(q.get("n"));

  if (!n.success) {
    if (!download) return new Response(null, { status: 404 });
    const zip = await zipClips(user.id, id.data);
    if (!zip) return new Response(null, { status: 404 });
    return new Response(zip as BodyInit, { headers: { "Content-Type": "application/zip", "Content-Length": String(zip.length), "Content-Disposition": 'attachment; filename="mi-carrusel-animado.zip"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }

  const rangeHeader = request.headers.get("range");
  const range = rangeHeader && /^bytes=\d{1,12}-\d{0,12}$/.test(rangeHeader) ? rangeHeader : undefined;
  const obj = await openClip(user.id, id.data, n.data, range);
  if (!obj) return new Response(null, { status: range ? 416 : 404 });
  const headers = new Headers({ "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  if (obj.contentLength !== undefined) headers.set("Content-Length", String(obj.contentLength));
  if (obj.contentRange) headers.set("Content-Range", obj.contentRange);
  if (download) headers.set("Content-Disposition", `attachment; filename="slide-${String(n.data).padStart(2, "0")}-animado.mp4"`);
  return new Response(obj.body, { status: obj.partial ? 206 : 200, headers });
}

/**
 * Recibe el ZIP con los PNG de los slides (los dibuja el navegador con las tipografías y colores del creador) y encola el video.
 * Excluida del proxy como las demás subidas: valida todo mientras transmite a MinIO. Solo plan Pro.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getApiCreator();
  if (!user) return Response.json({ error: "Inicia sesión con una cuenta activa." }, { status: 401 });
  if (!storageConfigured()) return Response.json({ error: "El almacenamiento no está configurado." }, { status: 503 });
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Carrusel no válido." }, { status: 400 });
  if (!(await rateLimit(`carrusel-animado:user:${user.id}`, 20, HOUR))) return Response.json({ error: "Demasiados intentos seguidos. Intenta en un rato." }, { status: 429 });
  if (!(await animationQuota(user.id)).allowed) return Response.json({ error: "El carrusel animado es del plan Pro." }, { status: 403 });
  // Rehacer un carrusel que ya se animó no gasta cupo del mes; este tope evita que se repita todo el día (cada vez cuesta IA y varios minutos de ffmpeg).
  if (!(await rateLimit(`carrusel-animado:carrusel:${id.data}`, 6, 24 * HOUR))) return Response.json({ error: "Ya animaste este carrusel varias veces hoy. Intenta mañana." }, { status: 429 });

  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return Response.json({ error: "Falta el tamaño del archivo." }, { status: 411 });
  if (declared > MAX_ZIP_BYTES) return Response.json({ error: "Las imágenes pesan demasiado." }, { status: 413 });
  if (!request.body) return Response.json({ error: "Archivo vacío." }, { status: 400 });

  let received = 0;
  let head: Buffer | null = Buffer.alloc(0);
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (received > MAX_ZIP_BYTES || received > declared) return cb(new Error("Tamaño excedido"));
      if (head) {
        head = Buffer.concat([head, chunk]);
        if (head.length < 4) return cb();
        if (!(head[0] === 0x50 && head[1] === 0x4b)) return cb(new Error("No es un ZIP"));
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
  let key = "";
  try {
    key = await storeFrames(user.id, id.data, Readable.fromWeb(request.body as unknown as NodeWebReadableStream).pipe(limiter));
    const r = await requestAnimation(user.id, id.data, key);
    if (!r.ok) {
      await deleteObject(key).catch(() => undefined);
      return Response.json({ error: r.error }, { status: 409 });
    }
    await audit({ action: "carrusel.animado", actorUserId: user.id, ip: await getClientIp(), meta: { carrusel: id.data, bytes: received } });
    return Response.json({ ok: true });
  } catch (err) {
    if (key) await deleteObject(key).catch(() => undefined);
    console.error("[carrusel-animado] no se pudo recibir", err instanceof Error ? err.message : err);
    return Response.json({ error: "No se pudo enviar el carrusel. Intenta de nuevo." }, { status: 500 });
  }
}
