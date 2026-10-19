import type { Metadata } from "next";
import Link from "next/link";
import { SyncButton } from "@/components/instagram/SyncButton";
import { Button, ButtonLink, Card, Chip, PageHeader } from "@/components/ui";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { formatDate } from "@/lib/billing/labels";
import { disconnectAction } from "@/lib/instagram/actions";
import { canConnect, getConnection, listMedia, profileOf } from "@/lib/instagram/service";

export const metadata: Metadata = { title: "Mi Instagram" };

const MESSAGES: Record<string, { tone: "exito" | "alerta" | "naranja"; text: string }> = {
  ok: { tone: "exito", text: "¡Listo! Tu Instagram quedó conectado." },
  cancelado: { tone: "naranja", text: "No diste el permiso en Instagram, así que no conectamos nada. Puedes intentarlo cuando quieras." },
  invalido: { tone: "alerta", text: "La conexión no se pudo verificar. Vuelve a intentarlo desde aquí." },
  "no-configurado": { tone: "naranja", text: "La conexión con Instagram todavía no está disponible. Estamos terminando su aprobación." },
  demasiados: { tone: "naranja", text: "Intentaste conectar varias veces seguidas. Prueba en una hora." },
};

const num = new Intl.NumberFormat("es-MX");

export default async function InstagramPage({ searchParams }: PageProps<"/mi-marca/instagram">) {
  const { user } = await requireCreatorAccess();
  const params = await searchParams;
  const estado = typeof params.estado === "string" ? params.estado : "";
  const motivo = typeof params.motivo === "string" ? params.motivo.slice(0, 160) : "";
  const conn = await getConnection(user.id);
  const media = conn ? await listMedia(user.id, 9) : [];
  const p = profileOf(conn);
  const msg = estado === "error" ? { tone: "alerta" as const, text: motivo || "No se pudo conectar tu Instagram." } : MESSAGES[estado];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader eyebrow="Mi marca" title="Mi Instagram" />
      {msg && (
        <p role="status" className={`rounded-xl p-3 text-sm font-semibold ${msg.tone === "exito" ? "bg-exito-100 text-exito" : msg.tone === "alerta" ? "bg-alerta-100 text-alerta" : "bg-naranja-100 text-ink-900"}`}>
          {msg.text}
        </p>
      )}

      {!conn ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-extrabold">Conecta tu cuenta</h2>
          <p className="text-sm text-ink-700">Con tu permiso leemos tus publicaciones y tus estadísticas para armar tu progreso sin que tengas que mandar capturas.</p>
          <ul className="list-disc pl-5 text-sm text-ink-700">
            <li>Entras con la página <strong>oficial de Instagram</strong>: nunca vemos tu contraseña.</li>
            <li>Solo pedimos permiso de <strong>lectura</strong> (perfil y estadísticas). No publicamos ni cambiamos nada en tu cuenta.</li>
            <li>Tu cuenta debe ser <strong>profesional</strong> (creador o empresa). Se cambia gratis en Configuración de Instagram.</li>
            <li>Puedes desconectarla cuando quieras y borramos esos datos.</li>
          </ul>
          {canConnect() ? (
            // Es una ruta que redirige al sitio de Instagram: se usa un enlace normal (no navegación interna de Next).
            <a href="/api/instagram/connect" className="tap inline-flex items-center self-start rounded-full bg-azul px-5 text-sm font-semibold text-blanco">
              Conectar mi Instagram
            </a>
          ) : (
            <p className="rounded-lg bg-naranja-100 p-3 text-sm">La conexión estará disponible muy pronto. Mientras tanto puedes mandarnos capturas de tus métricas cada mes.</p>
          )}
          <ButtonLink href="/progreso/metricas" variant="ghost" size="sm" className="self-start">
            Mandar capturas por ahora
          </ButtonLink>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold">@{conn.username}</h2>
              <Chip tone="exito">Conectada</Chip>
              {conn.lastError && <Chip tone="alerta">Revisar permiso</Chip>}
            </div>
            {conn.lastError && (
              <p role="alert" className="text-sm text-alerta">
                {conn.lastError}{" "}
                <a href="/api/instagram/connect" className="font-semibold underline underline-offset-4">
                  Volver a conectar
                </a>
              </p>
            )}
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[
                ["Seguidores", p.followers],
                ["Siguiendo", p.follows],
                ["Publicaciones", p.mediaCount],
              ].map(([l, v]) => (
                <div key={String(l)} className="rounded-xl bg-ink-100 p-3">
                  <dd className="font-display text-2xl">{num.format(Number(v))}</dd>
                  <dt className="text-xs text-ink-600">{String(l)}</dt>
                </div>
              ))}
            </dl>
            <p className="text-xs text-ink-500">{conn.lastSyncAt ? `Actualizado el ${formatDate(conn.lastSyncAt)}` : "Aún no se actualiza"} · se actualiza solo una vez al día · permiso vigente hasta el {formatDate(conn.tokenExpiresAt)} (se renueva solo).</p>
            <div className="flex flex-wrap items-center gap-3">
              <SyncButton />
              <form action={disconnectAction}>
                <Button type="submit" variant="ghost" size="sm">
                  Desconectar y borrar mis datos de Instagram
                </Button>
              </form>
            </div>
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-extrabold">Así te vemos</p>
              <p className="text-sm text-ink-600">Revisamos tu cuenta y te mostramos lo que vemos para que nos digas si acertamos.</p>
            </div>
            <ButtonLink href="/mi-marca/auditoria" size="sm" variant="outline">
              Ver mi auditoría
            </ButtonLink>
          </Card>

          <section className="flex flex-col gap-2" aria-label="Publicaciones recientes">
            <h2 className="font-extrabold">Tus publicaciones recientes</h2>
            {media.length === 0 && <p className="text-sm text-ink-600">Todavía no hay publicaciones leídas. Toca “Actualizar ahora”.</p>}
            {media.map((m) => {
              const x = (m.metrics && typeof m.metrics === "object" ? m.metrics : {}) as Record<string, number>;
              return (
                <Card key={m.id} className="flex flex-col gap-1 py-3">
                  <p className="line-clamp-2 text-sm">{m.caption || "(sin texto)"}</p>
                  <p className="text-xs text-ink-500">
                    {m.mediaType === "VIDEO" ? "Reel o video" : m.mediaType === "CAROUSEL_ALBUM" ? "Carrusel" : "Foto"} · {m.postedAt ? formatDate(m.postedAt) : ""}
                  </p>
                  <p className="text-xs text-ink-700">
                    ❤ {num.format(x.likes ?? 0)} · 💬 {num.format(x.comments ?? 0)}
                    {x.reach ? ` · alcance ${num.format(x.reach)}` : ""}
                    {x.saved ? ` · guardados ${num.format(x.saved)}` : ""}
                    {x.views ? ` · vistas ${num.format(x.views)}` : ""}
                  </p>
                  {m.permalink && (
                    <a href={m.permalink} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-azul underline underline-offset-4">
                      Ver en Instagram
                    </a>
                  )}
                </Card>
              );
            })}
          </section>
        </>
      )}
      <Link href="/mi-marca" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
        Volver a Mi marca
      </Link>
    </div>
  );
}
