import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/shell/AuthFrame";
import { getCurrentSession, homeFor } from "@/lib/auth/dal";
import { normalizeCode } from "@/lib/billing/promo";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegistroPage({ searchParams }: PageProps<"/registro">) {
  const session = await getCurrentSession();
  if (session && !session.user.mustChangePassword && session.user.status !== "disabled") redirect(homeFor(session.user));
  const params = await searchParams;
  const code = normalizeCode(params.codigo) ?? undefined;

  return (
    <AuthFrame title="Crea tu cuenta" subtitle="Solo para mayores de 18 años.">
      <RegisterForm initialCode={code} />
      <p className="mt-6 text-center text-sm text-ink-600">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold text-azul underline underline-offset-4">
          Entra
        </Link>
      </p>
    </AuthFrame>
  );
}
