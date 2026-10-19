import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { businessMetrics, daysAgo, incomeSince, loadFacts, usageSince } from "@/lib/admin/insights";
import { getPrices } from "@/lib/admin/limits";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Métricas del negocio" };

const mxn = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(cents / 100);
const pct = (n: number | null) => (n === null ? "—" : `${n} %`);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="font-display mt-1 text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </Card>
  );
}

export default async function MetricasPage() {
  await requireAdmin();
  const now = new Date();
  const monthAgo = daysAgo(30, now);
  const [facts, prices] = await Promise.all([loadFacts(), getPrices()]);
  const [usage, income] = await Promise.all([usageSince(monthAgo, undefined, prices), incomeSince(monthAgo)]);
  const m = businessMetrics(facts, now);
  const totalIncome = [...income.values()].reduce((s, v) => s + v, 0);
  const totalCost = [...usage.values()].reduce((s, v) => s + v.costUsd, 0) * prices.usdMxn * 100;
  const names = new Map(facts.map((f) => [f.user.id, f.user.name]));
  const rows = [...new Set([...usage.keys(), ...income.keys()])]
    .map((id) => ({ id, name: names.get(id) ?? "—", calls: usage.get(id)?.calls ?? 0, cost: (usage.get(id)?.costUsd ?? 0) * prices.usdMxn * 100, income: income.get(id) ?? 0 }))
    .sort((a, b) => b.cost - a.cost);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Últimos 30 días" title="Métricas del negocio" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Creadores registrados" value={String(m.creators)} hint={`${m.withSub} con suscripción`} />
        <Stat label="Planes" value={`${m.byPlan.basico} / ${m.byPlan.pro}`} hint="Básico / Pro" />
        <Stat label="Prueba → pago" value={pct(m.trialToPaid.pct)} hint={`${m.trialToPaid.paid} de ${m.trialToPaid.total} pruebas terminadas`} />
        <Stat label="Ingreso cobrado" value={mxn(totalIncome)} hint="Pagos de los últimos 30 días" />
      </div>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-extrabold">Permanencia</h2>
        <p className="text-xs text-ink-500">De quienes se suscribieron hace al menos 30, 60 y 90 días, cuántos siguen con suscripción viva.</p>
        <dl className="grid gap-3 sm:grid-cols-3 text-sm">
          {[
            ["Mes 2", m.retention.m2],
            ["Mes 3", m.retention.m3],
            ["Mes 4", m.retention.m4],
          ].map(([label, r]) => (
            <div key={String(label)}>
              <dt className="text-ink-500">{String(label)}</dt>
              <dd className="font-display text-2xl">{pct((r as { pct: number | null }).pct)}</dd>
              <dd className="text-xs text-ink-500">
                {(r as { kept: number }).kept} de {(r as { total: number }).total}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="p-0">
        <h2 className="px-5 pt-5 text-sm font-extrabold">Avance por fase</h2>
        <p className="px-5 text-xs text-ink-500">Qué porcentaje de los creadores llegó a cada paso y cuántos días tardó (mediana desde su registro).</p>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-ink-500">
            <tr>
              <th className="px-5 py-2">Paso</th>
              <th className="py-2">Lo lograron</th>
              <th className="py-2">%</th>
              <th className="px-5 py-2 text-right">Mediana (días)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {m.milestones.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-2">{s.label}</td>
                <td className="py-2">{s.done}</td>
                <td className="py-2">{pct(s.pct)}</td>
                <td className="px-5 py-2 text-right">{s.medianDays ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
          <h2 className="text-sm font-extrabold">Costo de IA contra ingreso</h2>
          <p className="text-xs text-ink-500">
            Costo estimado {mxn(totalCost)} · ingreso {mxn(totalIncome)} · <Link href="/admin/limites" className="text-azul underline">ajustar precios</Link>
          </p>
        </div>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-ink-500">
            <tr>
              <th className="px-5 py-2">Cliente</th>
              <th className="py-2">Llamadas</th>
              <th className="py-2">Costo estimado</th>
              <th className="px-5 py-2 text-right">Ingreso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {rows.length === 0 && (
              <tr>
                <td className="px-5 py-3 text-ink-500" colSpan={4}>
                  Todavía no hay llamadas reales a la IA ni pagos en este periodo.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-2">
                  <Link href={`/admin/clientes/${r.id}`} className="text-azul underline underline-offset-4">
                    {r.name}
                  </Link>
                </td>
                <td className="py-2">{r.calls}</td>
                <td className={`py-2 ${r.income > 0 && r.cost > r.income * 0.5 ? "font-semibold text-alerta" : ""}`}>{mxn(r.cost)}</td>
                <td className="px-5 py-2 text-right">{mxn(r.income)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-5 py-3 text-xs text-ink-500">Se marca en rojo si el costo pasa de la mitad de lo que el cliente pagó.</p>
      </Card>
    </div>
  );
}
