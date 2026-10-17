import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/dal";
import { getApiCreator } from "@/lib/auth/gates";
import { addImage } from "@/lib/carousel/service";
import { PHOTO_MAX_BYTES } from "@/lib/kit/service";
import { HOUR, rateLimit } from "@/lib/rate";

export const dynamic = "force-dynamic";

/** Sube la imagen de un slide (`?n=3`). Se valida por contenido y se re-codifica sin metadatos. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getApiCreator();
  if (!user) return Response.json({ error: "Inicia sesión con una cuenta activa." }, { status: 401 });
  if (!(await rateLimit(`carrusel-img:user:${user.id}`, 60, HOUR))) return Response.json({ error: "Demasiadas imágenes seguidas. Intenta más tarde." }, { status: 429 });
  const id = z.string().uuid().safeParse((await params).id);
  const n = z.coerce.number().int().min(1).max(12).safeParse(new URL(request.url).searchParams.get("n"));
  if (!id.success || !n.success) return Response.json({ error: "Datos no válidos." }, { status: 400 });

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0 || declared > PHOTO_MAX_BYTES) return Response.json({ error: "La imagen pesa demasiado (máximo 8 MB)." }, { status: 413 });
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0 || data.length > PHOTO_MAX_BYTES) return Response.json({ error: "La imagen pesa demasiado (máximo 8 MB)." }, { status: 413 });
  try {
    const r = await addImage(user.id, id.data, n.data, data, contentType);
    return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: 400 });
  } catch (err) {
    console.error("[carruseles] no se pudo guardar la imagen", err instanceof Error ? err.message : err);
    return Response.json({ error: "No se pudo guardar la imagen. Intenta de nuevo." }, { status: 500 });
  }
}
