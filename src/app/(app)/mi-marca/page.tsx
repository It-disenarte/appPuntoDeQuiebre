import { ChevronRight, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, ButtonLink, buttonClass, Card, SampleBadge } from "@/components/ui";
import { logoutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Mi marca" };

// Fase 0: datos de ejemplo. Brújula, voz y perfil llegan en las Fases 2 y 3.
const ROWS = [
  { title: "Perfil de voz", sub: "Basado en tu muestra del 14 de oct" },
  { title: "Perfil optimizado", sub: "Biografías listas · Foto 8 de 10" },
  { title: "Horario de grabación", sub: "Martes y jueves · 7:30 p. m." },
  { title: "Comunidad", sub: "Sesión en vivo jueves 8 p. m. · Discord · WhatsApp" },
];
const PALETTE = ["#3D6B3A", "#D8A23A", "#EFE5D2", "#26262A"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export default async function MiMarcaPage() {
  const user = await requireUser();
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-azul text-xl font-extrabold text-blanco" aria-hidden>
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-3xl">{user.name}</h1>
          <p className="truncate text-sm text-ink-500">{user.email}</p>
        </div>
        <SampleBadge />
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <section className="flex items-center justify-between gap-4 rounded-card bg-negro p-5 text-blanco">
            <div>
              <p className="font-extrabold">Plan Básico</p>
              <p className="text-sm text-ink-300">Prueba gratis · quedan 18 días</p>
            </div>
            {/* Se activa en la Fase 1 (cambio de plan con Stripe). */}
            <span className={buttonClass("accent", "sm", "shrink-0")}>Conocer Pro</span>
          </section>

          <Card>
            <p className="text-xs text-ink-500">Manual de identidad</p>
            <div className="mt-3 flex gap-2">
              {PALETTE.map((c) => (
                <span key={c} className="size-10 rounded-lg ring-1 ring-ink-200" style={{ background: c }} />
              ))}
            </div>
            <p className="mt-3 text-sm">Tono: cercano, práctico y alegre</p>
            <p className="mt-1 text-sm">Pilares: errores comunes · cultivos fáciles · mi historia</p>
            <p className="mt-3 text-sm font-semibold text-azul underline underline-offset-4">Ver manual completo</p>
          </Card>
        </div>

        <Card className="p-0">
          <ul className="divide-y divide-ink-200">
            {ROWS.map((r) => (
              <li key={r.title} className="flex items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.title}</p>
                  <p className="truncate text-xs text-ink-500">{r.sub}</p>
                </div>
                <ChevronRight className="size-4 text-ink-400" aria-hidden />
              </li>
            ))}
            <li className="flex items-center gap-3 px-5 py-4">
              <div className="flex-1">
                <p className="font-semibold">Modo pausa</p>
                <p className="text-xs text-ink-500">Congela tu racha hasta 1 semana</p>
              </div>
              <input type="checkbox" disabled className="size-5 accent-azul" aria-label="Modo pausa" />
            </li>
          </ul>
        </Card>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 lg:hidden">
        {user.role === "admin" && (
          <ButtonLink href="/admin" variant="outline">
            Panel de administrador
          </ButtonLink>
        )}
        <Link href="/cambiar-contrasena" className="inline-flex h-11 items-center px-2 text-sm font-semibold text-ink-700 underline underline-offset-4">
          Cambiar contraseña
        </Link>
        <form action={logoutAction}>
          <Button variant="ghost" type="submit">
            <LogOut className="size-4" aria-hidden /> Cerrar sesión
          </Button>
        </form>
      </div>
    </div>
  );
}
