import { isSameOrigin } from "@/lib/auth/dal";
import { getApiCreator } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { saveSubscription, subscriptionSchema } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Guarda la suscripción de notificaciones de este dispositivo. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getApiCreator();
  if (!user) return Response.json({ error: "Inicia sesión con una cuenta activa." }, { status: 401 });
  if (!(await rateLimit(`push:user:${user.id}`, 20, HOUR))) return Response.json({ error: "Demasiados intentos." }, { status: 429 });
  const body = await request.json().catch(() => null);
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Suscripción no válida." }, { status: 400 });
  await saveSubscription(user.id, parsed.data, request.headers.get("user-agent"));
  return Response.json({ ok: true });
}
