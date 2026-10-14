import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Card, Chip, PageHeader } from "@/components/ui";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { formatDate } from "@/lib/billing/labels";
import { formatMoney } from "@/lib/billing/service";
import { db } from "@/lib/db";
import { invoiceRequests, payments } from "@/lib/db/schema";
import { InvoiceForm } from "./InvoiceForm";

export const metadata: Metadata = { title: "Solicitar factura" };

const STATUS = { pendiente: "neutral", emitida: "exito", rechazada: "alerta" } as const;

export default async function FacturaPage() {
  const { user } = await requireCreatorAccess();
  const [paid, requests] = await Promise.all([
    db().select().from(payments).where(eq(payments.userId, user.id)).orderBy(desc(payments.paidAt)).limit(24),
    db()
      .select({ id: invoiceRequests.id, status: invoiceRequests.status, createdAt: invoiceRequests.createdAt, paymentId: invoiceRequests.paymentId, adminNote: invoiceRequests.adminNote })
      .from(invoiceRequests)
      .where(eq(invoiceRequests.userId, user.id))
      .orderBy(desc(invoiceRequests.createdAt)),
  ]);
  const requested = new Set(requests.map((r) => r.paymentId));
  const available = Object.fromEntries(
    paid.filter((p) => !requested.has(p.id)).map((p) => [p.id, `${formatDate(p.paidAt)} · ${formatMoney(p.amountCents, p.currency)}`]),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Mi marca" title="Solicitar factura" />
      {Object.keys(available).length === 0 ? (
        <Card>
          <p className="text-ink-700">No tienes pagos pendientes de facturar.</p>
          <p className="mt-1 text-sm text-ink-500">Durante la prueba gratis no hay cobros. Cuando tengas tu primer pago, podrás pedir su factura aquí.</p>
        </Card>
      ) : (
        <InvoiceForm payments={available} defaultEmail={user.email} />
      )}

      {requests.length > 0 && (
        <Card className="p-0">
          <h2 className="px-5 pt-5 text-sm font-extrabold">Tus solicitudes</h2>
          <ul className="mt-2 divide-y divide-ink-200">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p>Solicitada el {formatDate(r.createdAt)}</p>
                  {r.adminNote && <p className="text-xs text-ink-500">{r.adminNote}</p>}
                </div>
                <Chip tone={STATUS[r.status]}>{r.status[0]!.toUpperCase() + r.status.slice(1)}</Chip>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
