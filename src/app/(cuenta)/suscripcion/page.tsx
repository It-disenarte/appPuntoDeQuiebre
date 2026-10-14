import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, ButtonLink, Card, Chip, FormError, PageHeader } from "@/components/ui";
import { portalAction } from "@/lib/account/actions";
import { requireUser } from "@/lib/auth/dal";
import { hasAcceptedCommitment } from "@/lib/auth/gates";
import { hasCreatorAccess } from "@/lib/billing/access";
import { ACCESS_LABEL, ACCESS_TONE, subscriptionSummary } from "@/lib/billing/labels";
import { normalizeCode } from "@/lib/billing/promo";
import { formatMoney, getAccess, getPlanPrices } from "@/lib/billing/service";
import { billingConfigured } from "@/lib/billing/stripe";
import { PLANS } from "@/lib/plans";
import { PlanPicker } from "./PlanPicker";

export const metadata: Metadata = { title: "Tu plan" };

export default async function SuscripcionPage({ searchParams }: PageProps<"/suscripcion">) {
  const user = await requireUser();
  if (user.role === "admin") redirect("/admin");
  const params = await searchParams;
  const access = await getAccess(user.id);
  const sub = access.subscription;

  // Ya tiene suscripción (vigente, en gracia, suspendida o en proceso): se gestiona, no se crea otra.
  if (access.state !== "none" && sub) {
    const canEnter = hasCreatorAccess(access.state);
    const next = canEnter && !(await hasAcceptedCommitment(user.id)) ? "/bienvenida" : "/hoy";
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <PageHeader eyebrow="Tu suscripción" title={`Plan ${PLANS[sub.plan].name}`} action={<Chip tone={ACCESS_TONE[access.state]}>{ACCESS_LABEL[access.state]}</Chip>} />
        <Card>
          <p className={access.state === "suspended" || access.state === "grace" ? "font-semibold text-alerta" : "text-ink-700"}>
            {subscriptionSummary(access.state, sub, access.graceEndsAt)}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {canEnter && <ButtonLink href={next}>Entrar a la app</ButtonLink>}
            <form action={portalAction}>
              <Button type="submit" variant={canEnter ? "outline" : "primary"}>
                {access.state === "suspended" || access.state === "grace" ? "Actualizar pago" : "Gestionar pago"}
              </Button>
            </form>
          </div>
        </Card>
        {access.state === "pending" && <p className="text-sm text-ink-500">Si ya pagaste, espera unos segundos y recarga esta página.</p>}
      </div>
    );
  }

  const prices = await getPlanPrices();
  const priceLabels = Object.fromEntries(
    Object.entries(prices).map(([plan, p]) => [plan, `${formatMoney(p.amountCents, p.currency)} al mes`]),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={`Hola, ${user.name.split(" ")[0]}`} title="Elige tu plan" />
      {params.cancelado === "1" && <FormError message="No se completó el pago. Puedes intentarlo de nuevo cuando quieras." />}
      {!billingConfigured() ? (
        <Card>
          <p className="font-semibold">Los pagos todavía no están disponibles.</p>
          <p className="mt-1 text-sm text-ink-500">Estamos terminando de configurarlos. Vuelve a intentarlo más tarde.</p>
        </Card>
      ) : (
        <PlanPicker priceLabels={priceLabels} initialCode={normalizeCode(params.codigo) ?? undefined} />
      )}
      <p className="text-center text-xs text-ink-500">El pago se hace en la página segura de Stripe. Nunca vemos ni guardamos los datos de tu tarjeta.</p>
    </div>
  );
}
