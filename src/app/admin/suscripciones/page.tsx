import type { Metadata } from "next";
import Link from "next/link";
import { Card, Chip, PageHeader } from "@/components/ui";
import { listSubscriptions } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { computeAccess, type AccessState } from "@/lib/billing/access";
import { ACCESS_LABEL, ACCESS_TONE, formatDate } from "@/lib/billing/labels";
import { env } from "@/lib/env";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Suscripciones" };

export default async function SuscripcionesPage() {
  await requireAdmin();
  const subs = await listSubscriptions();
  const now = new Date();
  const rows = subs.map((s) => ({ ...s, access: computeAccess({ status: s.status, pastDueSince: s.pastDueSince }, now, env().BILLING_GRACE_DAYS) }));
  const counts = rows.reduce<Partial<Record<AccessState, number>>>((acc, r) => ((acc[r.access] = (acc[r.access] ?? 0) + 1), acc), {});
  const tiles: AccessState[] = ["trialing", "active", "grace", "suspended", "none"];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Panel de administrador" title="Suscripciones" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t} className="p-4">
            <p className="text-xs text-ink-500">{t === "none" ? "Terminadas" : ACCESS_LABEL[t]}</p>
            <p className="font-display mt-2 text-3xl">{counts[t] ?? 0}</p>
          </Card>
        ))}
      </div>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-xs text-ink-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Cliente</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">Próxima fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {rows.map((r) => {
                const next = r.access === "trialing" ? r.trialEnd : r.currentPeriodEnd;
                return (
                  <tr key={r.userId}>
                    <td className="px-5 py-3">
                      <Link href={`/admin/clientes/${r.userId}`} className="font-semibold text-azul hover:underline">
                        {r.name}
                      </Link>
                      <p className="text-xs text-ink-500">{r.email}</p>
                    </td>
                    <td className="px-5 py-3">{PLANS[r.plan].name}</td>
                    <td className="px-5 py-3">
                      <Chip tone={ACCESS_TONE[r.access]}>{ACCESS_LABEL[r.access]}</Chip>
                      {r.cancelAtPeriodEnd && <p className="mt-1 text-xs text-ink-500">Cancela al final del periodo</p>}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-ink-600">
                      {next ? `${r.access === "trialing" ? "Primer cobro" : r.cancelAtPeriodEnd ? "Termina" : "Renueva"} ${formatDate(next)}` : "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-ink-500">
                    Aún no hay suscripciones.
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
