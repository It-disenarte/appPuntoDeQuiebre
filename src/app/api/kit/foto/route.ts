import { isSameOrigin } from "@/lib/auth/dal";
import { getApiCreator } from "@/lib/auth/gates";
import { addPhoto, PHOTO_MAX_BYTES } from "@/lib/kit/service";
import { HOUR, rateLimit } from "@/lib/rate";

export const dynamic = "force-dynamic";

/** Sube una foto para la revelación del kit (una por petición). Se valida por contenido y se re-codifica sin metadatos. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getApiCreator();
  if (!user) return Response.json({ error: "Inicia sesión con una cuenta activa." }, { status: 401 });
  if (!(await rateLimit(`kit-foto:user:${user.id}`, 20, HOUR))) return Response.json({ error: "Demasiadas fotos seguidas. Intenta más tarde." }, { status: 429 });

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0 || declared > PHOTO_MAX_BYTES) return Response.json({ error: "La foto pesa demasiado (máximo 8 MB)." }, { status: 413 });

  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0 || data.length > PHOTO_MAX_BYTES) return Response.json({ error: "La foto pesa demasiado (máximo 8 MB)." }, { status: 413 });

  try {
    const r = await addPhoto(user.id, data, contentType);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    return Response.json({ ok: true, id: r.id });
  } catch (err) {
    console.error("[kit] no se pudo guardar la foto", err instanceof Error ? err.message : err);
    return Response.json({ error: "No se pudo guardar la foto. Intenta de nuevo." }, { status: 500 });
  }
}
