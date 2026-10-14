import type { Metadata } from "next";
import { Card, Chip, cn, PageHeader, SampleBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Semana" };

type Status = "publicado" | "programado" | "pendiente";

// Fase 0: datos de ejemplo. La parrilla real se genera en la Fase 4 (Contenido).
const ITEMS: { dow: string; day: number; title: string; meta: string; status: Status; today?: boolean }[] = [
  { dow: "Lun", day: 19, title: "Video · Cilantro que se seca", meta: "Nicho · Probado", status: "publicado" },
  { dow: "Mar", day: 20, title: "Carrusel · 5 plantas fáciles", meta: "Viral · Probado", status: "publicado" },
  { dow: "Mié", day: 21, title: "Video · 3 errores en tu huerto", meta: "Viral · Probado · 7:30 p. m.", status: "programado", today: true },
  { dow: "Jue", day: 22, title: "Carrusel · Calendario de riego", meta: "Nicho · Prueba", status: "pendiente" },
  { dow: "Vie", day: 23, title: "Video · Así empezó mi huerto", meta: "Nicho · Probado", status: "pendiente" },
  { dow: "Sáb", day: 24, title: "Carrusel · Mi kit para empezar", meta: "Conversión · Probado", status: "pendiente" },
  { dow: "Dom", day: 25, title: "Variante · Gancho B", meta: "Prueba · Reel de prueba", status: "pendiente" },
];

const STATUS_LABEL: Record<Status, { label: string; tone: "exito" | "azul" | "neutral" }> = {
  publicado: { label: "Publicado", tone: "exito" },
  programado: { label: "Programado", tone: "azul" },
  pendiente: { label: "Pendiente", tone: "neutral" },
};

const MIX = [
  { label: "Viral", pct: 50, color: "bg-azul" },
  { label: "Nicho", pct: 40, color: "bg-negro" },
  { label: "Conversión", pct: 10, color: "bg-naranja" },
];

export default async function SemanaPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Semana del 19 al 25 de octubre" title="Tu parrilla" action={<SampleBadge />} />

      <Card>
        <p className="text-xs text-ink-500">Mezcla de esta semana · Etapa de arranque</p>
        <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Viral 50 %, nicho 40 %, conversión 10 %">
          {MIX.map((m) => (
            <span key={m.label} className={m.color} style={{ width: `${m.pct}%` }} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700">
          {MIX.map((m) => (
            <li key={m.label} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm", m.color)} aria-hidden /> {m.label} {m.pct} %
            </li>
          ))}
        </ul>
      </Card>

      <ol className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {ITEMS.map((it) => {
          const s = STATUS_LABEL[it.status];
          return (
            <li key={it.day}>
              <Card
                className={cn("tap flex items-center gap-4 px-4 py-3.5", it.today && "ring-2 ring-azul")}
                aria-current={it.today ? "date" : undefined}
              >
                <div className={cn("w-10 shrink-0 text-center", it.today ? "text-azul" : "text-ink-500")}>
                  <p className="text-xs">{it.dow}</p>
                  <p className={cn("text-lg font-extrabold", !it.today && "text-ink-900")}>{it.day}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{it.title}</p>
                  <p className="text-xs text-ink-500">{it.meta}</p>
                </div>
                <Chip tone={s.tone}>{s.label}</Chip>
              </Card>
            </li>
          );
        })}
      </ol>

      <p className="rounded-2xl bg-naranja-100 px-4 py-3 text-sm text-ink-900">
        Esta semana probamos dos ganchos en el mismo video para descubrir cuál engancha más a tu público.
      </p>
    </div>
  );
}
