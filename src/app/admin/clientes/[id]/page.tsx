import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, Chip, PageHeader } from "@/components/ui";
import { daysAgo, loadFacts, MILESTONES, phaseLabel, incomeSince, usageSince } from "@/lib/admin/insights";
import { getPrices } from "@/lib/admin/limits";
import { getClient } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { ACCESS_LABEL, ACCESS_TONE, formatDate, subscriptionSummary } from "@/lib/billing/labels";
import { formatMoney } from "@/lib/billing/service";
import { billingConfigured, dashboardCustomerUrl } from "@/lib/billing/stripe";
import { PLANS } from "@/lib/plans";
import { ageFromBirthDate } from "@/lib/validation";
import { ClientActions } from "./ClientActions";

export const metadata: Metadata = { title: "Ficha de cliente" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

export default async function ClientePage({ params }: PageProps<"/admin/clientes/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const data = await getClient(id);
  if (!data) notFound();
  const { user, sub, commitment, access } = data;
  const age = user.birthDate ? ageFromBirthDate(user.birthDate) : null;
  const [facts] = user.role === "creator" ? await loadFacts(id) : [];
  const monthAgo = daysAgo(30);
  const prices = await getPrices();
  const [usage, income] = await Promise.all([usageSince(monthAgo, id, prices), incomeSince(monthAgo, id)]);
  const use = usage.get(id);
  const costMxn = (use?.costUsd ?? 0) * prices.usdMxn;
  const incomeMxn = (income.get(id) ?? 0) / 100;
  const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(n);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={user.email} title={user.name} action={<Chip tone={ACCESS_TONE[access]}>{ACCESS_LABEL[access]}</Chip>} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-extrabold">Cuenta</h2>
          <dl className="mt-2 divide-y divide-ink-200">
            <Row label="Rol">{user.role === "admin" ? "Administrador" : "Creador"}</Row>
            <Row label="Estado">{user.status === "disabled" ? "Desactivada" : "Activa"}</Row>
            <Row label="Edad">{age !== null ? `${age} años` : "—"}</Row>
            <Row label="Alta">{formatDate(user.createdAt)}</Row>
            <Row label="Último acceso">{user.lastLoginAt ? formatDate(user.lastLoginAt) : "Nunca"}</Row>
            <Row label="Términos aceptados">{user.termsVersion ?? "—"}</Row>
            <Row label="Compromiso">{commitment ? formatDate(commitment.acceptedAt) : "Pendiente"}</Row>
          </dl>
        </Card>

        <Card>
          <h2 className="text-sm font-extrabold">Suscripción</h2>
          {sub ? (
            <>
              <dl className="mt-2 divide-y divide-ink-200">
                <Row label="Plan">{PLANS[sub.plan].name}</Row>
                <Row label="Estado en Stripe">{sub.status}</Row>
                {sub.trialEnd && <Row label="Fin de prueba">{formatDate(sub.trialEnd)}</Row>}
                {sub.currentPeriodEnd && <Row label="Fin del periodo">{formatDate(sub.currentPeriodEnd)}</Row>}
                {sub.pastDueSince && <Row label="En mora desde">{formatDate(sub.pastDueSince)}</Row>}
              </dl>
              <p className="mt-3 text-sm text-ink-600">{subscriptionSummary(access, sub, null)}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-500">Sin suscripción.</p>
          )}
          {user.billingCustomerId && billingConfigured() && (
            <a href={dashboardCustomerUrl(user.billingCustomerId)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-azul underline">
              Ver en Stripe
            </a>
          )}
        </Card>
      </div>

      {facts && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="text-sm font-extrabold">Progreso en la app</h2>
            <p className="mt-1 text-sm font-semibold">{phaseLabel(facts)}</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {MILESTONES.map((m) => (
                <li key={m.id} className={facts.milestones[m.id] ? "text-ink-900" : "text-ink-400"}>
                  {facts.milestones[m.id] ? "✓" : "○"} {m.label}
                  {facts.milestones[m.id] ? <span className="text-xs text-ink-500"> · {formatDate(facts.milestones[m.id]!)}</span> : null}
                </li>
              ))}
            </ul>
            <dl className="mt-3 divide-y divide-ink-200">
              <Row label="Racha">{facts.streakWeeks} {facts.streakWeeks === 1 ? "semana" : "semanas"}</Row>
              <Row label="Última actividad">{facts.lastActivity ? formatDate(facts.lastActivity) : "Nunca"}</Row>
            </dl>
          </Card>
          <Card>
            <h2 className="text-sm font-extrabold">Uso de IA (últimos 30 días)</h2>
            <dl className="mt-2 divide-y divide-ink-200">
              <Row label="Llamadas reales">{use?.calls ?? 0}</Row>
              <Row label="Costo estimado">{money(costMxn)}</Row>
              <Row label="Ingreso cobrado">{money(incomeMxn)}</Row>
              <Row label="Costo / ingreso">{incomeMxn > 0 ? `${Math.round((costMxn / incomeMxn) * 100)} %` : "—"}</Row>
            </dl>
            <p className="mt-2 text-xs text-ink-500">Estimado con los precios de Límites y costos; no es la factura real.</p>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-0">
          <h2 className="px-5 pt-5 text-sm font-extrabold">Pagos</h2>
          <ul className="mt-2 divide-y divide-ink-200 text-sm">
            {data.payments.map((p) => (
              <li key={p.id} className="flex justify-between px-5 py-2.5">
                <span>{formatDate(p.paidAt)}</span>
                <span className="font-semibold">{formatMoney(p.amountCents, p.currency)}</span>
              </li>
            ))}
            {data.payments.length === 0 && <li className="px-5 py-4 text-ink-500">Sin pagos todavía.</li>}
          </ul>
        </Card>
        <Card className="p-0">
          <h2 className="px-5 pt-5 text-sm font-extrabold">Códigos usados</h2>
          <ul className="mt-2 divide-y divide-ink-200 text-sm">
            {data.redemptions.map((r) => (
              <li key={`${r.code}-${r.createdAt.toISOString()}`} className="flex justify-between gap-3 px-5 py-2.5">
                <span className="font-semibold">{r.code}</span>
                <span className="text-ink-600">
                  {r.status === "completed" ? (r.convertedAt ? "Convirtió a pago" : "Usado") : r.status === "reserved" ? "Pago en curso" : "Liberado"}
                </span>
              </li>
            ))}
            {data.redemptions.length === 0 && <li className="px-5 py-4 text-ink-500">Ninguno.</li>}
          </ul>
        </Card>
      </div>

      {user.id !== admin.id && <ClientActions userId={user.id} disabled={user.status === "disabled"} email={user.email} proOverride={user.proOverride} />}
    </div>
  );
}
