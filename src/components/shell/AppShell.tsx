"use client";

import { CalendarDays, ChartColumn, House, LogOut, UserRound, Video } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { Logo } from "@/components/brand/Logo";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { TourProvider } from "@/components/tour/TourProvider";
import { cn } from "@/components/ui";
import { logoutAction } from "@/lib/auth/actions";

const NAV = [
  { href: "/hoy", label: "Hoy", icon: House },
  { href: "/semana", label: "Semana", icon: CalendarDays },
  { href: "/grabar", label: "Grabar", icon: Video },
  { href: "/progreso", label: "Progreso", icon: ChartColumn },
  { href: "/mi-marca", label: "Mi marca", icon: UserRound },
] as const;

export function AppShell({
  userName,
  isAdmin,
  notice,
  toursSeen,
  children,
}: {
  userName: string;
  isAdmin: boolean;
  /** Aviso importante (p. ej. pago fallido en periodo de gracia). */
  notice?: { text: string; href: string };
  /** Guías del asistente de inicio que ya vio. */
  toursSeen: string[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  // El estudio de grabación va en oscuro para no afectar la luz de la toma.
  const dark = pathname.startsWith("/grabar");
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className={cn("min-h-dvh", dark ? "bg-negro text-blanco" : "bg-ink-100")}>
      {/* Barra lateral en computadora */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-negro px-5 py-7 text-blanco lg:flex">
        <Link href="/hoy" className="px-2" aria-label="Inicio">
          <Logo surface="negro" className="w-40" />
        </Link>
        <nav className="mt-10 flex flex-col gap-1" aria-label="Secciones">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              data-tour={`nav-${href.slice(1)}`}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "tap flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem] font-semibold",
                isActive(href) ? "bg-azul text-blanco" : "text-ink-300 hover:bg-ink-800 hover:text-blanco",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-ink-700 pt-5">
          {isAdmin && (
            <Link href="/admin" className="mb-3 block rounded-xl px-3 py-2 text-sm font-semibold text-naranja hover:bg-ink-800">
              Panel de administrador
            </Link>
          )}
          <p className="truncate px-3 text-sm text-ink-300">{userName}</p>
          <Link href="/cambiar-contrasena" className="mt-2 block rounded-xl px-3 py-2 text-sm text-ink-400 hover:bg-ink-800 hover:text-blanco">
            Cambiar contraseña
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="tap mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-400 hover:bg-ink-800 hover:text-blanco">
              <LogOut className="size-4" aria-hidden /> Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-64">
        <div className="pt-safe">
          {notice && (
            <Link href={notice.href} role="alert" className="block bg-naranja px-4 py-3 text-center text-sm font-semibold text-negro">
              {notice.text} <span className="underline underline-offset-4">Actualizar pago</span>
            </Link>
          )}
          {!dark && <InstallPrompt />}
        </div>
        <main className="mx-auto w-full max-w-xl px-4 pt-5 pb-32 lg:max-w-5xl lg:px-10 lg:pt-10 lg:pb-12">{children}</main>
      </div>

      <Suspense>
        <TourProvider seen={toursSeen} />
      </Suspense>

      {/* Barra inferior en teléfono */}
      <nav
        aria-label="Secciones"
        className={cn(
          "pb-safe fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl lg:hidden",
          dark ? "border-ink-800 bg-negro/90" : "border-ink-200 bg-blanco/90",
        )}
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  data-tour={`nav-${href.slice(1)}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "tap flex flex-col items-center gap-1 pt-2.5 pb-2 text-[0.6875rem] font-semibold",
                    active ? (dark ? "text-azul-100" : "text-azul") : dark ? "text-ink-400" : "text-ink-500",
                  )}
                >
                  <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
