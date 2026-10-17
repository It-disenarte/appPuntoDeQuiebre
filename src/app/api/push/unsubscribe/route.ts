import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/dal";
import { getApiCreator } from "@/lib/auth/gates";
import { removeSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getApiCreator();
  if (!user) return Response.json({ error: "Inicia sesión con una cuenta activa." }, { status: 401 });
  const body = z.object({ endpoint: z.string().max(600) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Solicitud no válida." }, { status: 400 });
  await removeSubscription(user.id, body.data.endpoint);
  return Response.json({ ok: true });
}
