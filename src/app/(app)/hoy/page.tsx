import { Camera, Flame } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink, Card, Chip, cn, PageHeader, SampleBadge } from "@/components/ui";
import { requireCreatorAccess } from "@/lib/auth/gates";

export const metadata: Metadata = { title: "Hoy" };

// Fase 0: datos de ejemplo (referencia visual). Se conectan en Fases 6 (parrilla) y 10 (racha).
const WEEK = [
  { d: "L", state: "done" },
  { d: "M", state: "done" },
  { d: "M", state: "today" },
  { d: "J", state: "future" },
  { d: "V", state: "future" },
  { d: "S", state: "future" },
  { d: "D", state: "future" },
] as const;

export default async function HoyPage() {
  const { user } = await requireCreatorAccess();
  const firstName = user.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={`Hola, ${firstName}`}
        title="Tu día"
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-naranja px-3.5 py-2 text-sm font-extrabold text-negro">
            <Flame className="size-4" aria-hidden /> 12 días
          </span>
        }
      />
      <div className="flex justify-end">
        <SampleBadge />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="py-4">
            <ol className="grid grid-cols-7 text-center" aria-label="Racha de esta semana">
              {WEEK.map((w, i) => (
                <li key={i} className="flex flex-col items-center gap-2">
                  <span className={cn("text-xs", w.state === "today" ? "font-extrabold text-ink-900" : "text-ink-500")}>{w.d}</span>
                  <span
                    className={cn(
                      "size-8 rounded-full",
                      w.state === "done" && "bg-naranja",
                      w.state === "today" && "border-[2.5px] border-azul",
                      w.state === "future" && "bg-ink-200",
                    )}
                    aria-label={w.state === "done" ? "cumplido" : w.state === "today" ? "hoy" : "pendiente"}
                  />
                </li>
              ))}
            </ol>
          </Card>

          <section className="relative overflow-hidden rounded-card bg-azul p-6 text-blanco">
            <p className="rotulo text-azul-100">Tarea de hoy</p>
            <h2 className="font-display mt-3 text-3xl lg:text-4xl">Publica tu video: 3 errores al empezar un huerto</h2>
            <div className="mt-4 flex gap-2">
              <Chip tone="invert">Viral</Chip>
              <Chip tone="outlineLight">Probado</Chip>
            </div>
            <p className="mt-4 text-sm text-azul-100">Programado en Instagram · 7:30 p. m.</p>
            <ButtonLink href="/semana" variant="light" className="mt-5">
              Ver guion y textos
            </ButtonLink>
          </section>

          <Card className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-naranja-100 text-ink-900">
              <Camera className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-500">Historia del día</p>
              <p className="font-semibold">Muestra tu huerto antes de regarlo</p>
            </div>
            <Chip tone="naranja">Pendiente</Chip>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <p className="text-xs text-ink-500">Tu próxima sesión de grabación</p>
            <p className="mt-2 text-lg font-extrabold">Jueves · 7:30 a 9:00 p. m.</p>
            <p className="mt-1 text-sm text-ink-500">4 guiones listos · Luz: usa tu aro de luz</p>
            <ButtonLink href="/grabar" variant="dark" className="mt-4">
              Ir al estudio
            </ButtonLink>
          </Card>
          <p className="px-2 text-center text-sm text-ink-500 italic">“Cada video te acerca a quien necesita escucharte.”</p>
        </div>
      </div>
    </div>
  );
}
