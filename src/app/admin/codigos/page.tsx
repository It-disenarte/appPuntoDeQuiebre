import type { Metadata } from "next";
import { Card, Chip, PageHeader } from "@/components/ui";
import { togglePromoAction } from "@/lib/admin/actions";
import { listPromoCodes } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { formatDate } from "@/lib/billing/labels";
import { billingConfigured } from "@/lib/billing/stripe";
import { PLANS } from "@/lib/plans";
import { PromoForm } from "./PromoForm";

export const metadata: Metadata = { title: "Códigos" };

export default async function CodigosPage() {
  await requireAdmin();
  const codes = await listPromoCodes();
  const now = new Date();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Panel de administrador" title="Códigos" />
      <PromoForm discountsEnabled={billingConfigured()} />

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="text-xs text-ink-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Código</th>
                <th className="px-5 py-3 font-semibold">Beneficio</th>
                <th className="px-5 py-3 font-semibold">Usos</th>
                <th className="px-5 py-3 font-semibold">Conversión a pago</th>
                <th className="px-5 py-3 font-semibold">Vigencia</th>
                <th className="px-5 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {codes.map((c) => {
                const expired = c.endsAt !== null && c.endsAt < now;
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-3">
                      <p className="font-mono font-semibold">{c.code}</p>
                      {c.campaign && <p className="text-xs text-ink-500">{c.campaign}</p>}
                    </td>
                    <td className="px-5 py-3">
                      {c.kind === "trial" ? `${c.trialDays} días gratis` : `${c.percentOff} % de descuento${c.durationMonths ? ` por ${c.durationMonths} meses` : " (1er cobro)"}`}
                      <p className="text-xs text-ink-500">{c.plan ? `Plan ${PLANS[c.plan].name}` : "Cualquier plan"}</p>
                    </td>
                    <td className="px-5 py-3">
                      {c.uses}
                      {c.maxUses !== null && ` / ${c.maxUses}`}
                    </td>
                    <td className="px-5 py-3">
                      {c.converted} de {c.completed}
                      {c.completed > 0 && <span className="text-ink-500"> ({Math.round((c.converted / c.completed) * 100)} %)</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-ink-600">
                      {c.startsAt ? `Desde ${formatDate(c.startsAt)}` : "Desde hoy"}
                      <br />
                      {c.endsAt ? `Hasta ${formatDate(c.endsAt)}` : "Sin fecha de fin"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {expired ? (
                        <Chip>Vencido</Chip>
                      ) : (
                        <form action={togglePromoAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="active" value={String(!c.active)} />
                          <button type="submit" className="tap">
                            <Chip tone={c.active ? "exito" : "neutral"}>{c.active ? "Activo · pausar" : "Pausado · activar"}</Chip>
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {codes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-ink-500">
                    Aún no hay códigos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
