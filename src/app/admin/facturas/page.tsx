import type { Metadata } from "next";
import { Button, Card, Chip, PageHeader } from "@/components/ui";
import { updateInvoiceRequestAction } from "@/lib/admin/actions";
import { listInvoiceRequests } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { formatDate } from "@/lib/billing/labels";
import { formatMoney } from "@/lib/billing/service";
import { REGIMENES_FISCALES, USOS_CFDI } from "@/lib/validation";

export const metadata: Metadata = { title: "Facturas" };

export default async function FacturasPage() {
  await requireAdmin();
  const [pending, handled] = await Promise.all([listInvoiceRequests("pendiente"), listInvoiceRequests("resueltas")]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${pending.length} pendientes`} title="Solicitudes de factura" />
      <p className="text-sm text-ink-600">Cuentas por cobrar de Diseñarte emite el CFDI y lo envía al correo indicado. Después márcala como emitida.</p>

      {pending.map((r) => (
        <Card key={r.id} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-extrabold">{r.razonSocial}</p>
              <p className="text-sm text-ink-500">
                {r.userName} · {r.userEmail} · solicitada el {formatDate(r.createdAt)}
              </p>
            </div>
            {r.amountCents !== null && r.currency && r.paidAt && (
              <Chip tone="azul">
                {formatMoney(r.amountCents, r.currency)} · pagado el {formatDate(r.paidAt)}
              </Chip>
            )}
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm md:grid-cols-2">
            <div><dt className="inline text-ink-500">RFC: </dt><dd className="inline font-mono font-semibold">{r.rfc}</dd></div>
            <div><dt className="inline text-ink-500">C.P.: </dt><dd className="inline font-semibold">{r.codigoPostal}</dd></div>
            <div><dt className="inline text-ink-500">Régimen: </dt><dd className="inline">{r.regimenFiscal} · {REGIMENES_FISCALES[r.regimenFiscal] ?? ""}</dd></div>
            <div><dt className="inline text-ink-500">Uso CFDI: </dt><dd className="inline">{r.usoCfdi} · {USOS_CFDI[r.usoCfdi] ?? ""}</dd></div>
            <div><dt className="inline text-ink-500">Enviar a: </dt><dd className="inline">{r.email}</dd></div>
            {r.providerInvoiceId && <div><dt className="inline text-ink-500">Factura Stripe: </dt><dd className="inline font-mono text-xs">{r.providerInvoiceId}</dd></div>}
          </dl>
          {r.notes && <p className="rounded-lg bg-ink-100 px-3 py-2 text-sm">{r.notes}</p>}
          <form action={updateInvoiceRequestAction} className="flex flex-col gap-3 md:flex-row md:items-end">
            <input type="hidden" name="id" value={r.id} />
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
              Nota para el cliente (opcional)
              <input name="adminNote" maxLength={500} className="h-11 rounded-xl border border-ink-300 px-4 font-normal" />
            </label>
            <Button type="submit" name="status" value="emitida">
              Marcar emitida
            </Button>
            <Button type="submit" name="status" value="rechazada" variant="danger">
              Rechazar
            </Button>
          </form>
        </Card>
      ))}
      {pending.length === 0 && <Card className="text-ink-500">No hay solicitudes pendientes.</Card>}

      {handled.length > 0 && (
        <Card className="p-0">
          <h2 className="px-5 pt-5 text-sm font-extrabold">Resueltas recientemente</h2>
          <ul className="mt-2 divide-y divide-ink-200 text-sm">
            {handled.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span>
                  {r.razonSocial} <span className="text-ink-500">· {r.rfc}</span>
                </span>
                <Chip tone={r.status === "emitida" ? "exito" : "alerta"}>{r.status === "emitida" ? "Emitida" : "Rechazada"}</Chip>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
