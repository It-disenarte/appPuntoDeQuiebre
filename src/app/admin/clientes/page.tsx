import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, Chip, PageHeader } from "@/components/ui";
import { listClients, PAGE_SIZE, STATUS_FILTERS, type StatusFilter } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { ACCESS_LABEL, ACCESS_TONE, formatDate } from "@/lib/billing/labels";
import { isPlanId, PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Clientes" };

const STATUS_OPTIONS: Record<StatusFilter, string> = { prueba: "En prueba", activa: "Activa", mora: "Pago fallido", terminada: "Terminada", sin: "Sin suscripción" };

export default async function ClientesPage({ searchParams }: PageProps<"/admin/clientes">) {
  await requireAdmin();
  const p = await searchParams;
  const q = typeof p.q === "string" ? p.q.trim().slice(0, 80) : "";
  const plan = isPlanId(p.plan) ? p.plan : undefined;
  const status = typeof p.estado === "string" && (p.estado in STATUS_FILTERS || p.estado === "sin") ? (p.estado as StatusFilter) : undefined;
  const page = Math.max(1, Math.min(1000, Number(p.pagina) || 1));
  const { rows, total } = await listClients({ q: q || undefined, plan, status, page });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (n: number) => {
    const sp = new URLSearchParams({ ...(q && { q }), ...(plan && { plan }), ...(status && { estado: status }), pagina: String(n) });
    return `/admin/clientes?${sp}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${total} ${total === 1 ? "cliente" : "clientes"}`} title="Clientes" />

      <form className="grid grid-cols-1 gap-3 rounded-card bg-blanco p-4 shadow-card md:grid-cols-[1fr_auto_auto_auto]" role="search">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre o correo" aria-label="Buscar" className="h-11 rounded-xl border border-ink-300 px-4" />
        <select name="plan" defaultValue={plan ?? ""} aria-label="Plan" className="h-11 rounded-xl border border-ink-300 px-3">
          <option value="">Todos los planes</option>
          <option value="basico">Básico</option>
          <option value="pro">Pro</option>
        </select>
        <select name="estado" defaultValue={status ?? ""} aria-label="Estado de pago" className="h-11 rounded-xl border border-ink-300 px-3">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_OPTIONS).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
        <button type="submit" className="tap h-11 rounded-full bg-azul px-5 font-semibold text-blanco">
          Filtrar
        </button>
      </form>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-xs text-ink-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Cliente</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Pago</th>
                <th className="px-5 py-3 font-semibold">Fase</th>
                <th className="px-5 py-3 font-semibold">Último acceso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-ink-100/60">
                  <td className="px-5 py-3">
                    <Link href={`/admin/clientes/${r.id}`} className="font-semibold text-azul hover:underline">
                      {r.name}
                    </Link>
                    <p className="text-xs text-ink-500">{r.email}</p>
                    {r.status === "disabled" && <Chip tone="alerta">Desactivada</Chip>}
                  </td>
                  <td className="px-5 py-3">{r.plan ? PLANS[r.plan].name : "—"}</td>
                  <td className="px-5 py-3">
                    <Chip tone={ACCESS_TONE[r.access]}>{ACCESS_LABEL[r.access]}</Chip>
                  </td>
                  <td className="px-5 py-3 text-ink-600">{r.stage}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-ink-600">{r.lastLoginAt ? formatDate(r.lastLoginAt) : "Nunca"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-ink-500">
                    No hay clientes con esos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Paginación">
          {page > 1 && (
            <ButtonLink href={link(page - 1)} variant="outline" size="sm">
              Anterior
            </ButtonLink>
          )}
          <span className="text-sm text-ink-600">
            Página {page} de {pages}
          </span>
          {page < pages && (
            <ButtonLink href={link(page + 1)} variant="outline" size="sm">
              Siguiente
            </ButtonLink>
          )}
        </nav>
      )}
    </div>
  );
}
