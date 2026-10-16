import { audit } from "@/lib/audit";
import { getApiCreator } from "@/lib/auth/gates";
import { buildManualPdf } from "@/lib/brujula/pdf";
import { getManual, getSchedule, getVoiceProfile } from "@/lib/brujula/service";
import { HOUR, rateLimit } from "@/lib/rate";
import { getClientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

/** Descarga de la brújula de marca en PDF (solo el propio usuario y solo cuando ya la aprobó). */
export async function GET() {
  const user = await getApiCreator();
  if (!user) return Response.json({ error: "Inicia sesión con una cuenta activa." }, { status: 401 });
  if (!(await rateLimit(`manual-pdf:user:${user.id}`, 20, HOUR))) return Response.json({ error: "Demasiadas descargas. Intenta más tarde." }, { status: 429 });

  const [manual, voice, schedule] = await Promise.all([getManual(user.id), getVoiceProfile(user.id), getSchedule(user.id)]);
  if (!manual) return Response.json({ error: "Todavía no tienes brújula." }, { status: 404 });
  if (manual.status !== "aprobado") return Response.json({ error: "Aprueba las 5 secciones de tu brújula para descargarla." }, { status: 409 });

  const pdf = await buildManualPdf({ name: user.name, manual: manual.content, voice: voice?.content ?? null, schedule: schedule?.result ?? null, mock: manual.mock });
  await audit({ action: "brujula.manual_downloaded", actorUserId: user.id, ip: await getClientIp() });
  const safe = user.name.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "creador";
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="brujula-de-marca-${safe}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
