import { audit } from "@/lib/audit";
import { getApiCreator } from "@/lib/auth/gates";
import { getManual } from "@/lib/brujula/service";
import { buildManualPdf } from "@/lib/brujula/pdf";
import { HOUR, rateLimit } from "@/lib/rate";
import { getClientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

/** Descarga del manual de identidad audiovisual en PDF (solo el propio usuario). */
export async function GET() {
  const user = await getApiCreator();
  if (!user) return Response.json({ error: "Inicia sesión con una cuenta activa." }, { status: 401 });
  if (!(await rateLimit(`manual-pdf:user:${user.id}`, 20, HOUR))) return Response.json({ error: "Demasiadas descargas. Intenta más tarde." }, { status: 429 });
  const manual = await getManual(user.id);
  if (!manual) return Response.json({ error: "Todavía no tienes manual. Completa tu brújula." }, { status: 404 });

  const pdf = await buildManualPdf(manual.content, user.name);
  await audit({ action: "brujula.manual_downloaded", actorUserId: user.id, ip: await getClientIp() });
  const safeName = (manual.content.identity.displayName || user.name).normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "creador";
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="manual-identidad-${safeName}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
