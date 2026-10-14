import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { confirmCheckout } from "@/lib/billing/service";

export const metadata: Metadata = { title: "Confirmando pago" };

export default async function ExitoPage({ searchParams }: PageProps<"/suscripcion/exito">) {
  const user = await requireUser();
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : "";

  let confirmed = false;
  try {
    confirmed = sessionId ? await confirmCheckout(sessionId, user.id) : false;
  } catch (err) {
    console.error("[billing] no se pudo confirmar el checkout", err);
  }
  if (confirmed) redirect("/bienvenida");

  // El webhook puede tardar unos segundos: se ofrece reintentar.
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader eyebrow="Casi listo" title="Confirmando tu pago" />
      <Card>
        <p className="text-ink-700">Estamos confirmando tu pago con Stripe. Esto tarda unos segundos.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href={`/suscripcion/exito?session_id=${encodeURIComponent(sessionId)}`}>Volver a revisar</ButtonLink>
          <ButtonLink href="/suscripcion" variant="outline">
            Ver mi plan
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
