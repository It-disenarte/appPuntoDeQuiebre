"use client";

import { useActionState } from "react";
import { Button, Field, FormError } from "@/components/ui";
import { changePasswordAction, type FormState } from "@/lib/auth/actions";
import { PASSWORD_MIN } from "@/lib/auth/password-rules";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state?.error} />
      <Field label="Contraseña actual" name="current" type="password" autoComplete="current-password" required />
      <Field
        label="Contraseña nueva"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
        hint={`Mínimo ${PASSWORD_MIN} caracteres, con letras y al menos un número.`}
      />
      <Field label="Confirma la contraseña nueva" name="confirm" type="password" autoComplete="new-password" required />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
