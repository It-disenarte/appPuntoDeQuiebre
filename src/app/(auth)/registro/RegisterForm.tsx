"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, CheckboxField, Field, FormError } from "@/components/ui";
import { registerAction, type ActionState } from "@/lib/account/actions";
import { PASSWORD_MIN } from "@/lib/auth/password-rules";

export function RegisterForm({ initialCode }: { initialCode?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registerAction, undefined);
  const [show, setShow] = useState(false);
  const f = state?.fields;
  const code = f?.code ?? initialCode;
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
      <Field label="Fecha de nacimiento" name="birthDate" type="date" required autoComplete="bday" defaultValue={f?.birthDate} hint="Solo para confirmar que eres mayor de 18 años." />
      <div className="flex flex-col gap-1.5">
        <Field
          label="Contraseña"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          hint={`Mínimo ${PASSWORD_MIN} caracteres, con letras y un número.`}
        />
        <button type="button" onClick={() => setShow((v) => !v)} className="tap self-start text-sm font-semibold text-azul underline underline-offset-4">
          {show ? "Ocultar contraseña" : "Mostrar contraseña"}
        </button>
      </div>
      <details open={Boolean(code)} className="rounded-xl bg-ink-100 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">¿Tienes un código?</summary>
        <div className="mt-3">
          <Field label="Código del webinar" name="code" autoCapitalize="characters" spellCheck={false} maxLength={40} defaultValue={code} hint="Con tu código tienes 30 días gratis del plan Básico." />
        </div>
      </details>
      <CheckboxField
        name="terms"
        required
        label={
          <>
            Soy mayor de 18 años y acepto los{" "}
            <Link href="/terminos" target="_blank" className="font-semibold text-azul underline">
              términos
            </Link>{" "}
            y la{" "}
            <Link href="/privacidad" target="_blank" className="font-semibold text-azul underline">
              privacidad
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
