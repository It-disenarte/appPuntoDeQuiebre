"use client";

import { useActionState } from "react";
import { Button, Field, FormError } from "@/components/ui";
import { createAdminAction, type AdminState } from "@/lib/admin/actions";
import { TempPasswordNotice } from "../clientes/[id]/ClientActions";

export function CreateAdminForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(createAdminAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3 border-t border-ink-200 pt-4">
      <p className="text-sm font-semibold">Agregar administrador</p>
      <FormError message={state?.error} />
      {state?.tempPassword && <TempPasswordNotice password={state.tempPassword} />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <Field label="Nombre" name="name" required maxLength={80} />
        <Field label="Correo" name="email" type="email" required />
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
