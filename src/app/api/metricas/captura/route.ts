import { isSameOrigin } from "@/lib/auth/dal";
import { getApiCreator } from "@/lib/auth/gates";
import { addShot, isValidPeriod } from "@/lib/metrics/service";
import { PHOTO_MAX_BYTES } from "@/lib/kit/service";
import { HOUR, rateLimit } from "@/lib/rate";

export const dynamic = "force-dynamic";

/** Sube una captura de las estadísticas (una por petición). Se valida por contenido y se borra después de leerla. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getApiCreator();
  if (!user) return Response.json({ error: "Inicia sesión con una cuenta activa." }, { status: 401 });
  if (!(await rateLimit(`metricas-shot:user:${user.id}`, 40, HOUR))) return Response.json({ error: "Demasiadas capturas seguidas. Intenta más tarde." }, { status: 429 });

  const period = new URL(request.url).searchParams.get("periodo") ?? "";
  if (!isValidPeriod(period)) return Response.json({ error: "Ese mes no se puede reportar." }, { status: 400 });
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0 || declared > PHOTO_MAX_BYTES) return Response.json({ error: "La captura pesa demasiado (máximo 8 MB)." }, { status: 413 });
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0 || data.length > PHOTO_MAX_BYTES) return Response.json({ error: "La captura pesa demasiado (máximo 8 MB)." }, { status: 413 });

  try {
    const r = await addShot(user.id, period, data, contentType);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    return Response.json({ ok: true, count: r.count });
  } catch (err) {
    console.error("[metricas] no se pudo guardar la captura", err instanceof Error ? err.message : err);
    return Response.json({ error: "No se pudo guardar la captura. Intenta de nuevo." }, { status: 500 });
  }
}
