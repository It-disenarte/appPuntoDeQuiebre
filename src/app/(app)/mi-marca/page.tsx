import { ChevronRight, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, ButtonLink, Card, Chip } from "@/components/ui";
import { portalAction } from "@/lib/account/actions";
import { logoutAction } from "@/lib/auth/actions";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { subscriptionSummary } from "@/lib/billing/labels";
import { getManual, getOverview } from "@/lib/brujula/service";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Mi marca" };

// Perfil optimizado y comunidad llegan en fases posteriores (3-4 y 10).
const SOON = [
  { title: "Perfil optimizado", sub: "Biografías y calificación de foto · Fase 4" },
  { title: "Comunidad", sub: "Sesión en vivo, Discord y WhatsApp · Fase 10" },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export default async function MiMarcaPage() {
  const { user, access } = await requireCreatorAccess();
  const sub = access.subscription;
  const [overview, manual] = await Promise.all([getOverview(user.id), getManual(user.id)]);
  const m = manual?.content;
  const rows = [
    { href: "/mi-marca/brujula", title: "Mi brújula", sub: overview.progress.complete ? "Completa · toca para editar" : `${overview.progress.done} de ${overview.progress.total} bloques`, done: overview.progress.complete },
    { href: "/mi-marca/voz", title: "Perfil de voz", sub: overview.hasVoice ? (overview.voiceIsMock ? "Versión de prueba" : "Listo") : "Graba tu muestra de 2 a 3 minutos", done: overview.hasVoice },
    { href: "/mi-marca/horario", title: "Horario de grabación", sub: overview.scheduleAccepted ? "Aceptado · toca para editar" : overview.hasSchedule ? "Falta confirmar tu propuesta" : "5 preguntas rápidas", done: overview.scheduleAccepted },
  ];
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
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <section className="rounded-card bg-negro p-5 text-blanco">
            <p className="font-extrabold">{sub ? `Plan ${PLANS[sub.plan].name}` : "Cuenta de administrador"}</p>
            <p className="mt-1 text-sm text-ink-300">{sub ? subscriptionSummary(access.state, sub, access.graceEndsAt) : "Vista previa sin suscripción."}</p>
            {sub && (
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={portalAction}>
                  <Button type="submit" variant="accent" size="sm">
                    {sub.plan === "basico" ? "Cambiar a Pro o gestionar pago" : "Gestionar pago"}
                  </Button>
                </form>
                <ButtonLink href="/mi-marca/factura" variant="ghost" size="sm" className="text-blanco hover:bg-ink-800">
                  Solicitar factura
                </ButtonLink>
              </div>
            )}
          </section>

          <Card>
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-500">Manual de identidad</p>
              {!m && <Chip>Pendiente</Chip>}
            </div>
            {m ? (
              <>
                <div className="mt-3 flex gap-2">
                  {m.creative.palette.colors.map((c) => (
                    <span key={c.hex + c.role} className="size-10 rounded-lg ring-1 ring-ink-200" style={{ background: c.hex }} title={c.name} />
                  ))}
                </div>
                <p className="mt-3 text-sm">Pilares: {m.creative.pillars.map((p) => p.name).join(" · ")}</p>
                <Link href="/mi-marca/manual" className="mt-3 inline-block text-sm font-semibold text-azul underline underline-offset-4">
                  Ver manual completo
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-600">Se arma con tu brújula: pilares, tono, paleta y estilo de grabación.</p>
                <ButtonLink href="/mi-marca/brujula" size="sm" className="mt-3">
                  {overview.progress.done === 0 ? "Empezar mi brújula" : "Continuar mi brújula"}
                </ButtonLink>
              </>
            )}
          </Card>
        </div>

        <Card className="p-0">
          <ul className="divide-y divide-ink-200">
            {rows.map((r) => (
              <li key={r.title}>
                <Link href={r.href} className="flex items-center gap-3 px-5 py-4 hover:bg-ink-100">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{r.title}</p>
                    <p className="truncate text-xs text-ink-500">{r.sub}</p>
                  </div>
                  {r.done && <Chip tone="exito">Listo</Chip>}
                  <ChevronRight className="size-4 text-ink-400" aria-hidden />
                </Link>
              </li>
            ))}
            {SOON.map((r) => (
              <li key={r.title} className="flex items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-600">{r.title}</p>
                  <p className="truncate text-xs text-ink-500">{r.sub}</p>
                </div>
                <Chip>Pronto</Chip>
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
