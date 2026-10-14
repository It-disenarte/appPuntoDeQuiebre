import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { requireUser, homeFor } from "@/lib/auth/dal";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata: Metadata = { title: "Cambiar contraseña" };

export default async function CambiarContrasenaPage() {
  const user = await requireUser({ allowPasswordChange: true });
  return (
    <div className="pt-safe flex min-h-dvh flex-col items-center bg-ink-100 px-6 py-10">
      <Logo surface="blanco" className="w-36" />
      <div className="mt-10 w-full max-w-sm rounded-card bg-blanco p-6 shadow-card">
        <h1 className="font-display text-3xl">{user.mustChangePassword ? "Crea tu contraseña" : "Cambiar contraseña"}</h1>
        <p className="mt-2 mb-6 text-sm text-ink-500">
          {user.mustChangePassword
            ? "Entraste con una contraseña temporal. Crea una nueva para continuar."
            : "Al cambiarla se cerrará tu sesión en los demás dispositivos."}
        </p>
        <ChangePasswordForm />
        {!user.mustChangePassword && (
          <Link href={homeFor(user)} className="mt-4 block text-center text-sm font-semibold text-ink-600 underline underline-offset-4">
            Cancelar
          </Link>
        )}
      </div>
    </div>
  );
}
