import { handleWebhook } from "@/lib/billing/service";

export const dynamic = "force-dynamic";

/**
 * Webhook de Stripe. Pública (Stripe no tiene sesión), protegida por la firma del encabezado
 * Stripe-Signature. Responde 500 ante errores de proceso para que Stripe reintente.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 1_000_000) return new Response("Demasiado grande", { status: 413 });
  try {
    const result = await handleWebhook(raw, request.headers.get("stripe-signature"));
    if (result === "firma-invalida") return new Response("Firma inválida", { status: 400 });
    return Response.json({ received: true });
  } catch {
    return new Response("Error", { status: 500 });
  }
}
