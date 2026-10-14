import type { Metadata } from "next";
import { Card, Chip, cn, PageHeader, SampleBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Progreso" };

// Fase 0: datos de ejemplo. Las métricas reales de Instagram llegan en la Fase 6 (Hábito).
const STATS = [
  { label: "Seguidores", value: "842", note: "+18 % vs. mes anterior", up: true },
  { label: "Vistas promedio", value: "1,240", note: "+32 % vs. mes anterior", up: true },
  { label: "Guardados", value: "86", note: "en 14 publicaciones" },
  { label: "Racha más larga", value: "12 días", note: "sigue así" },
];
const WEEKS = [
  { label: "Sem 1", v: 48 },
  { label: "Sem 2", v: 62 },
  { label: "Sem 3", v: 70 },
  { label: "Sem 4", v: 100 },
];

export default async function ProgresoPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Últimos 30 días · Instagram" title="Tu progreso" action={<SampleBadge />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-ink-500">{s.label}</p>
            <p className="font-display mt-2 text-3xl normal-case">{s.value}</p>
            <p className={cn("mt-1 text-xs", s.up ? "font-semibold text-exito" : "text-ink-500")}>{s.note}</p>
          </Card>
        ))}
      </div>

      <Card>
        <p className="text-sm font-extrabold">Vistas por semana</p>
        <div className="mt-4 flex h-36 items-end gap-3" role="img" aria-label="Las vistas subieron cada semana; la semana 4 es la más alta.">
          {WEEKS.map((w, i) => {
            const last = i === WEEKS.length - 1;
            return (
              <div key={w.label} className="flex h-full flex-1 flex-col justify-end gap-2 text-center">
                <div className={cn("rounded-t-lg", last ? "bg-azul" : "bg-azul-100")} style={{ height: `${w.v}%` }} />
                <span className={cn("text-xs", last ? "font-extrabold" : "text-ink-500")}>{w.label}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <h2 className="font-display mt-2 text-2xl">Lo que estamos aprendiendo</h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <Chip tone="naranja">Hipótesis · 14 de 30 videos</Chip>
          <p className="mt-3 font-extrabold">Tus ganchos con pregunta retienen más que los de dato</p>
          <p className="mt-1 text-sm text-ink-500">La próxima parrilla trae 2 videos más con ese gancho.</p>
        </Card>
        <Card>
          <Chip tone="azul">Prueba terminada</Chip>
          <p className="mt-3 font-extrabold">Ganó el gancho B en “3 errores al empezar un huerto”</p>
        </Card>
      </div>
    </div>
  );
}
