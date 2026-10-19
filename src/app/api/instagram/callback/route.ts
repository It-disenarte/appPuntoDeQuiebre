import { getApiCreator } from "@/lib/auth/gates";
import { completeConnection } from "@/lib/instagram/service";

export const dynamic = "force-dynamic";

/** Instagram regresa aquí con un código (o con un error si el creador no dio permiso). El `state` debe coincidir con la cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (q: string, clear = true) =>
    new Response(null, { status: 302, headers: { Location: `${url.origin}/mi-marca/instagram?${q}`, ...(clear ? { "Set-Cookie": "pdq_ig_state=; HttpOnly; SameSite=Lax; Path=/api/instagram; Max-Age=0" } : {}) } });
  const user = await getApiCreator();
  if (!user) return Response.redirect(`${url.origin}/login`, 302);

  const cookie = request.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith("pdq_ig_state="))?.slice("pdq_ig_state=".length);
  const state = url.searchParams.get("state");
  if (!cookie || !state || cookie !== state) return back("estado=invalido");
  if (url.searchParams.get("error")) return back("estado=cancelado");
  const code = url.searchParams.get("code");
  if (!code || code.length > 1000) return back("estado=invalido");

  const r = await completeConnection(user.id, code);
  return r.ok ? back("estado=ok") : back(`estado=error&motivo=${encodeURIComponent(r.error.slice(0, 160))}`);
}
