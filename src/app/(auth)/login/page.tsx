import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { ISO_BOTTOM, ISO_CRACK, ISO_TOP, ISO_VIEWBOX } from "@/components/brand/paths";
import { Corte } from "@/components/ui";
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
    <div className="flex min-h-dvh flex-col bg-azul lg:flex-row">
      {/* Panel de marca */}
      <section className="pt-safe relative flex flex-col overflow-hidden text-blanco lg:w-1/2">
        <div className="px-6 pt-10 pb-6 lg:px-14 lg:pt-14">
          <Logo surface="azul" className="w-44 lg:w-56" />
          <h1 className="font-display mt-10 hidden text-7xl lg:block">
            El momento
            <br />
            en que <span className="text-naranja">todo</span>
            <br />
            <span className="text-naranja">cambia</span>
          </h1>
          <p className="mt-6 max-w-sm text-azul-100 lg:text-lg">Tu marca personal, de “no sé qué grabar” a publicar con constancia y datos.</p>
        </div>
        {/* Q gigante recortada por el borde (manual §12) */}
        <svg viewBox={ISO_VIEWBOX} className="pointer-events-none absolute -right-16 -bottom-40 hidden h-[34rem] lg:block" aria-hidden>
          <path d={ISO_TOP} fill="#FBFBFB" />
          <path d={ISO_BOTTOM} fill="#FE6807" />
          <path d={ISO_CRACK} fill="#09080D" />
        </svg>
        <Corte to="blanco" grieta="naranja" className="-mb-px mt-auto lg:hidden" />
      </section>

      {/* Formulario */}
      <section className="flex flex-1 flex-col bg-blanco px-6 pt-2 pb-10 lg:items-center lg:justify-center lg:rounded-l-[2rem] lg:px-14">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-4xl">Entrar</h2>
          <p className="mt-1 mb-6 text-sm text-ink-500">Usa el correo con el que te registraste.</p>
          <LoginForm next={next} initialError={error} />
        </div>
      </section>
    </div>
  );
}
