import { deleteByIgUser, parseSignedRequest } from "@/lib/instagram/service";

export const dynamic = "force-dynamic";

/** Meta avisa aquí cuando alguien quita el permiso de la app desde Instagram: se desconecta y se borran sus datos de Instagram. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  const data = typeof signed === "string" ? parseSignedRequest(signed) : null;
  if (!data?.user_id) return Response.json({ error: "Solicitud no válida" }, { status: 400 });
  await deleteByIgUser(data.user_id);
  return Response.json({ ok: true });
}
