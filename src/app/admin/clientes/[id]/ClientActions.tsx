"use client";

import { useActionState } from "react";
import { Button, Card, Field, FormError, FormSuccess } from "@/components/ui";
import { deleteUserAction, resetPasswordAction, revokeSessionsAction, setUserStatusAction, type AdminState } from "@/lib/admin/actions";

export function TempPasswordNotice({ password }: { password: string }) {
  return (
    <div role="status" className="rounded-xl bg-azul-50 p-4 text-sm">
      <p className="font-semibold">Contraseña temporal (se muestra solo esta vez):</p>
      <p className="mt-2 rounded-lg bg-blanco px-3 py-2 font-mono text-base tracking-wider select-all">{password}</p>
      <p className="mt-2 text-ink-600">Compártela por un canal privado. Al entrar se le pedirá crear una nueva.</p>
    </div>
  );
}

export function ClientActions({ userId, disabled, email }: { userId: string; disabled: boolean; email: string }) {
  const [reset, resetAction, resetting] = useActionState<AdminState, FormData>(resetPasswordAction, undefined);
  const [status, statusAction, changing] = useActionState<AdminState, FormData>(setUserStatusAction, undefined);
  const [revoke, revokeAction, revoking] = useActionState<AdminState, FormData>(revokeSessionsAction, undefined);
  const [del, delAction, deleting] = useActionState<AdminState, FormData>(deleteUserAction, undefined);

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-extrabold">Acciones</h2>
      <FormError message={reset?.error ?? status?.error ?? revoke?.error} />
      <FormSuccess message={status?.message ?? revoke?.message} />
      {reset?.tempPassword && <TempPasswordNotice password={reset.tempPassword} />}
      <div className="flex flex-wrap gap-3">
        <form
          action={resetAction}
          onSubmit={(e) => {
            if (!confirm("¿Restablecer la contraseña? Se cerrarán sus sesiones.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" variant="outline" disabled={resetting}>
            Restablecer contraseña
          </Button>
        </form>
        <form action={revokeAction}>
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" variant="outline" disabled={revoking}>
            Cerrar sus sesiones
          </Button>
        </form>
        <form
          action={statusAction}
          onSubmit={(e) => {
            if (!disabled && !confirm("¿Desactivar la cuenta? No podrá entrar hasta que la reactives.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="status" value={disabled ? "active" : "disabled"} />
          <Button type="submit" variant={disabled ? "primary" : "danger"} disabled={changing}>
            {disabled ? "Reactivar cuenta" : "Desactivar cuenta"}
          </Button>
        </form>
      </div>
      <p className="text-xs text-ink-500">Desactivar no cancela la suscripción en Stripe: hazlo desde “Ver en Stripe” si corresponde.</p>

      {disabled && (
        <form
          action={delAction}
          onSubmit={(e) => {
            if (!confirm("Esto elimina para siempre la cuenta y todos sus datos y archivos. No se puede deshacer. ¿Continuar?")) e.preventDefault();
          }}
          className="flex flex-col gap-3 rounded-xl border border-alerta/40 bg-alerta-100/40 p-4"
        >
          <h3 className="text-sm font-extrabold text-alerta">Eliminar definitivamente</h3>
          <p className="text-xs text-ink-700">Borra su perfil, marca, grabaciones, carruseles, fotos, métricas, pagos y solicitudes de factura de nuestra base y sus archivos. En Stripe se conservan sus pagos. La bitácora guarda que lo hiciste.</p>
          <FormError message={del?.error} />
          <input type="hidden" name="userId" value={userId} />
          <Field label={`Para confirmar escribe su correo: ${email}`} name="confirmEmail" type="email" autoComplete="off" required />
          <Button type="submit" variant="danger" disabled={deleting} className="self-start">
            {deleting ? "Eliminando…" : "Eliminar cuenta y datos"}
          </Button>
        </form>
      )}
    </Card>
  );
}
