"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormError, FormSuccess, SelectField } from "@/components/ui";
import { createPromoAction, type AdminState } from "@/lib/admin/actions";

export function PromoForm({ discountsEnabled }: { discountsEnabled: boolean }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(createPromoAction, undefined);
  const [kind, setKind] = useState<"trial" | "discount">("trial");

  return (
    <form action={action} className="flex flex-col gap-4 rounded-card bg-blanco p-5 shadow-card">
      <h2 className="text-sm font-extrabold">Nuevo código</h2>
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Código" name="code" required placeholder="WEBINAR-OCT" autoCapitalize="characters" maxLength={40} />
        <SelectField
          label="Tipo"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "trial" | "discount")}
          options={discountsEnabled ? { trial: "Prueba gratis", discount: "Descuento" } : { trial: "Prueba gratis" }}
          hint={discountsEnabled ? undefined : "Los descuentos requieren Stripe configurado."}
        />
        <SelectField label="Plan" name="plan" defaultValue="basico" options={{ basico: "Básico", pro: "Pro", any: "Cualquiera" }} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {kind === "trial" ? (
          <Field label="Días gratis" name="trialDays" type="number" min={1} max={90} defaultValue={30} required />
        ) : (
          <>
            <Field label="% de descuento" name="percentOff" type="number" min={1} max={100} required />
            <Field label="Meses que dura" name="durationMonths" type="number" min={1} max={24} hint="Vacío = solo el primer cobro." />
          </>
        )}
        <Field label="Usos máximos" name="maxUses" type="number" min={1} hint="Vacío = sin límite." />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Válido desde" name="startsAt" type="date" />
        <Field label="Válido hasta" name="endsAt" type="date" />
        <Field label="Campaña" name="campaign" maxLength={80} placeholder="Webinar octubre" />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Creando…" : "Crear código"}
      </Button>
    </form>
  );
}
