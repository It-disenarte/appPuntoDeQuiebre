import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { logoutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/dal";

/** Marco de las pantallas previas a la app: suscripción y compromiso. */
export default async function CuentaLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh bg-ink-100">
      <header className="pt-safe bg-azul">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Logo surface="azul" className="w-32" />
          <div className="flex items-center gap-3 text-sm text-azul-100">
            <span className="hidden truncate sm:inline">{user.name}</span>
            <form action={logoutAction}>
              <button type="submit" className="tap flex items-center gap-1.5 rounded-full px-3 py-2 font-semibold text-blanco hover:bg-azul-700">
                <LogOut className="size-4" aria-hidden /> Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-8 lg:py-12">{children}</main>
    </div>
  );
}
