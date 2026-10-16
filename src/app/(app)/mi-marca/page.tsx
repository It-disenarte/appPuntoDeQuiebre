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
    { href: "/mi-marca/historia", title: "Tu historia", sub: overview.story.ready ? "Completa · toca para editar" : `${overview.story.done} de ${overview.story.total} preguntas`, done: overview.story.ready },
    { href: "/mi-marca/manual", title: "Mi brújula", sub: overview.manualApproved ? "Aprobada" : overview.hasManual ? `${overview.sectionsApproved} de 5 secciones aprobadas` : "Se arma con tu historia", done: overview.manualApproved },
    { href: "/mi-marca/voz", title: "Perfil de voz", sub: overview.hasVoiceProfile ? (overview.manualMock ? "Versión de prueba" : "Listo") : "Se genera con tu historia", done: overview.hasVoiceProfile },
    { href: "/mi-marca/horario", title: "Horario de grabación", sub: overview.scheduleAccepted ? "Aceptado · toca para editar" : overview.hasSchedule ? "Falta confirmar tu propuesta" : "Pocas preguntas", done: overview.scheduleAccepted },
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
              <p className="text-xs text-ink-500">Brújula de marca</p>
              {!m && <Chip>Pendiente</Chip>}
            </div>
            {m ? (
              <>
                <p className="mt-2 text-sm font-semibold">{m.nicho.principal}</p>
                <p className="mt-1 text-sm text-ink-600">“{m.frase_de_marca}”</p>
                <p className="mt-3 text-sm">Pilares: {m.pilares.map((p) => p.nombre).join(" · ")}</p>
                <Link href="/mi-marca/manual" className="mt-3 inline-block text-sm font-semibold text-azul underline underline-offset-4">
                  {overview.manualApproved ? "Ver mi brújula" : "Revisar mi brújula"}
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-600">Se arma con tu historia: nicho, público, pilares y tono.</p>
                <ButtonLink href={overview.next?.href ?? "/mi-marca/historia"} size="sm" className="mt-3">
                  {overview.next?.text ?? "Empezar mi historia"}
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
