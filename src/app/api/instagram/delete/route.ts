import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { deleteByIgUser, parseSignedRequest } from "@/lib/instagram/service";

export const dynamic = "force-dynamic";

/** “Solicitud de eliminación de datos” de Meta: borra lo de Instagram y responde con el formato que Meta exige. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  const data = typeof signed === "string" ? parseSignedRequest(signed) : null;
  if (!data?.user_id) return Response.json({ error: "Solicitud no válida" }, { status: 400 });
  await deleteByIgUser(data.user_id);
  return Response.json({ url: `${env().APP_URL.replace(/\/$/, "")}/privacidad`, confirmation_code: randomUUID() });
}
