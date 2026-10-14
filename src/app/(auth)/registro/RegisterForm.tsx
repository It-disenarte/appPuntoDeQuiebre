"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, CheckboxField, Field, FormError } from "@/components/ui";
import { registerAction, type ActionState } from "@/lib/account/actions";
import { PASSWORD_MIN } from "@/lib/auth/password-rules";

export function RegisterForm({ initialCode }: { initialCode?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registerAction, undefined);
  const f = state?.fields;
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state?.error} />
      <Field label="Nombre completo" name="name" autoComplete="name" required maxLength={80} defaultValue={f?.name} />
      <Field
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={f?.email}
      />
      <Field label="Fecha de nacimiento" name="birthDate" type="date" required autoComplete="bday" defaultValue={f?.birthDate} />
      <Field
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        hint={`Mínimo ${PASSWORD_MIN} caracteres, con letras y al menos un número.`}
      />
      <Field label="Confirma tu contraseña" name="confirm" type="password" autoComplete="new-password" required />
      <Field
        label="Código del webinar (opcional)"
        name="code"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={40}
        defaultValue={f?.code ?? initialCode}
        hint="Con tu código tienes 30 días gratis del plan Básico."
      />
      <CheckboxField
        name="terms"
        required
        label={
          <>
            Confirmo que soy mayor de 18 años y acepto los{" "}
            <Link href="/terminos" target="_blank" className="font-semibold text-azul underline">
              términos
            </Link>{" "}
            y el{" "}
            <Link href="/privacidad" target="_blank" className="font-semibold text-azul underline">
              aviso de privacidad
            </Link>
            .
          </>
        }
      />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
        {pending ? "Creando tu cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
