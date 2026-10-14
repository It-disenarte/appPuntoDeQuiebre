import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/shell/AuthFrame";
import { getCurrentSession, homeFor } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/request";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  desactivada: "Tu cuenta está desactivada. Escríbenos para reactivarla.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await getCurrentSession();
  if (session && !session.user.mustChangePassword && session.user.status !== "disabled") redirect(homeFor(session.user));

  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next, "") || undefined : undefined;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <AuthFrame title="Entrar" subtitle="Usa el correo con el que te registraste.">
      <LoginForm next={next} initialError={error} />
      <p className="mt-6 text-center text-sm text-ink-600">
        ¿Aún no tienes cuenta?{" "}
        <Link href="/registro" className="font-semibold text-azul underline underline-offset-4">
          Regístrate
        </Link>
      </p>
    </AuthFrame>
  );
}
