"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormSuccess, SelectField, TextAreaField } from "@/components/ui";
import { invoiceRequestAction, type ActionState } from "@/lib/account/actions";
import { REGIMENES_FISCALES, USOS_CFDI } from "@/lib/validation";

const regimenes = Object.fromEntries(Object.entries(REGIMENES_FISCALES).map(([k, v]) => [k, `${k} · ${v}`]));
const usos = Object.fromEntries(Object.entries(USOS_CFDI).map(([k, v]) => [k, `${k} · ${v}`]));

export function InvoiceForm({ payments, defaultEmail }: { payments: Record<string, string>; defaultEmail: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(invoiceRequestAction, undefined);
  const f = state?.fields;
  if (state?.ok) return <FormSuccess message="Listo. Recibimos tu solicitud; te enviaremos la factura por correo." />;
  return (
    <form action={action} className="flex flex-col gap-4 rounded-card bg-blanco p-5 shadow-card">
      <FormError message={state?.error} />
      <SelectField label="Pago a facturar" name="paymentId" options={payments} required defaultValue={f?.paymentId} placeholder="Elige un pago" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="RFC" name="rfc" required maxLength={13} autoCapitalize="characters" spellCheck={false} defaultValue={f?.rfc} />
        <Field label="Código postal fiscal" name="codigoPostal" required inputMode="numeric" maxLength={5} defaultValue={f?.codigoPostal} />
      </div>
      <Field label="Nombre o razón social (como aparece en tu constancia)" name="razonSocial" required maxLength={200} defaultValue={f?.razonSocial} />
      <SelectField label="Régimen fiscal" name="regimenFiscal" options={regimenes} required defaultValue={f?.regimenFiscal} placeholder="Elige tu régimen" />
      <SelectField label="Uso del CFDI" name="usoCfdi" options={usos} required defaultValue={f?.usoCfdi ?? "G03"} />
      <Field label="Correo para recibir la factura" name="email" type="email" required defaultValue={f?.email ?? defaultEmail} />
      <TextAreaField label="Notas (opcional)" name="notes" maxLength={500} defaultValue={f?.notes} />
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Solicitar factura"}
      </Button>
    </form>
  );
}
