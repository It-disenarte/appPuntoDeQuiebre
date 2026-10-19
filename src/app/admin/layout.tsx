import { LogOut } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { logoutAction } from "@/lib/auth/actions";
import { requireAdmin } from "@/lib/auth/dal";
import { errorSummary } from "@/lib/errors";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const errors = await errorSummary().catch(() => ({ open: 0, repeating: 0 }));
  return (
    <div className="min-h-dvh bg-ink-100 lg:flex">
      <aside className="pt-safe bg-negro text-blanco lg:fixed lg:inset-y-0 lg:w-64 lg:px-5 lg:py-7">
        <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-2 lg:py-0">
          <Logo surface="negro" className="w-32 lg:w-40" />
          <p className="rotulo text-naranja lg:mt-4">Administrador</p>
        </div>
        <AdminNav errors={errors} />
        <div className="flex items-center justify-between border-t border-ink-700 px-3 py-1 lg:absolute lg:inset-x-5 lg:bottom-7 lg:block lg:px-0 lg:pt-5">
          <Link href="/hoy" className="block rounded-xl px-3 py-2 text-sm text-ink-300 hover:bg-ink-800">
            Ver app de creador
          </Link>
          <p className="mt-2 hidden truncate px-3 text-sm text-ink-400 lg:block">{admin.email}</p>
          <form action={logoutAction}>
            <button type="submit" className="tap mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-400 hover:bg-ink-800 hover:text-blanco">
              <LogOut className="size-4" aria-hidden /> Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 lg:ml-64 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
