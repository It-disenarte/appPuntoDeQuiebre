"use client";

import { useActionState } from "react";
import { Button, Field, FormError } from "@/components/ui";
import { loginAction, type FormState } from "@/lib/auth/actions";

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormError message={state?.error ?? initialError} />
      <Field label="Correo" name="email" type="email" autoComplete="email" inputMode="email" required autoCapitalize="none" spellCheck={false} />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
      <p className="text-center text-sm text-ink-500">¿Olvidaste tu contraseña? Pídele a tu asesor que la restablezca.</p>
    </form>
  );
}
