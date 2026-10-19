import { getApiCreator } from "@/lib/auth/gates";
import { authorizeUrl } from "@/lib/instagram/api";
import { canConnect, newState } from "@/lib/instagram/service";
import { HOUR, rateLimit } from "@/lib/rate";

export const dynamic = "force-dynamic";

/** Inicio de la conexión: manda al creador a la página oficial de Instagram para que dé su permiso (solo lectura). */
export async function GET(request: Request) {
  const user = await getApiCreator();
  const base = new URL(request.url).origin;
  if (!user) return Response.redirect(`${base}/login`, 302);
  if (!canConnect()) return Response.redirect(`${base}/mi-marca/instagram?estado=no-configurado`, 302);
  if (!(await rateLimit(`ig-conectar:user:${user.id}`, 10, HOUR))) return Response.redirect(`${base}/mi-marca/instagram?estado=demasiados`, 302);
  const state = newState();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(null, { status: 302, headers: { Location: authorizeUrl(state), "Set-Cookie": `pdq_ig_state=${state}; HttpOnly; SameSite=Lax; Path=/api/instagram; Max-Age=600${secure}` } });
}
