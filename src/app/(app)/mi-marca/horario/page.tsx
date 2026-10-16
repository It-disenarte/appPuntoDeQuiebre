import { Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, Chip, FormSuccess, PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { acceptScheduleAction } from "@/lib/brujula/actions";
import { blockRange, dayLabel } from "@/lib/brujula/schedule";
import { getOverview, getSchedule } from "@/lib/brujula/service";
import { ScheduleForm } from "./ScheduleForm";

export const metadata: Metadata = { title: "Mi horario" };

export default async function HorarioPage({ searchParams }: PageProps<"/mi-marca/horario">) {
  const { user } = await requireCreatorAccess();
  const params = await searchParams;
  const [schedule, overview] = await Promise.all([getSchedule(user.id), getOverview(user.id)]);
  const editing = params.editar === "1" || !schedule;
  const accepted = Boolean(schedule?.acceptedAt);
  const r = schedule?.result;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Steps overview={overview} current="horario" />
      <PageHeader eyebrow="Mi marca" title="Tu horario para crear" />
      <FormSuccess message={params.listo ? "Horario guardado." : undefined} />

      {editing ? (
        <>
          <Card className="flex flex-col gap-3">
            <p className="font-extrabold">Los creadores que crecen no son los que tienen más tiempo: son los que no fallan.</p>
            <p className="text-sm text-ink-700">Por eso apartamos días fijos en tu semana, como una cita contigo que no cambia cada vez.</p>
            <ul className="list-disc pl-5 text-sm text-ink-700">
              <li>Cuando grabar ya tiene día y hora, no tienes que decidirlo: solo llegas y grabas.</li>
              <li>Tu público se acostumbra a verte seguido, y el algoritmo también.</li>
              <li>La app te avisa un día antes y una hora antes, para que llegues con tu guion listo.</li>
            </ul>
            <p className="text-sm text-ink-700">
              Elige días que <strong>sí puedas cumplir</strong>, aunque sean pocos.
            </p>
          </Card>
          <ScheduleForm initial={schedule?.answers ?? null} />
        </>
      ) : (
        r && (
          <>
            <Card className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-extrabold">{accepted ? "Tu horario" : "Esta es nuestra propuesta"}</p>
                {accepted ? <Chip tone="exito">Aceptado</Chip> : <Chip tone="naranja">Falta tu confirmación</Chip>}
              </div>
              <p className="text-sm text-ink-800">{r.mensaje}</p>
              <ul className="flex flex-col gap-3">
                {r.bloques.map((b, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-ink-100 px-4 py-3">
                    <div>
                      <p className="font-semibold">{b.flotante ? "Día de respaldo flotante" : dayLabel(b.dia)}</p>
                      <p className="text-sm text-ink-600">{b.flotante ? b.nota : blockRange(b)}</p>
                    </div>
                    <Chip tone={b.tipo === "respaldo" ? "neutral" : "azul"}>{b.tipo === "respaldo" ? "Respaldo" : "Fijo"}</Chip>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-ink-700">
                Suman <strong>{r.horas_semana} h</strong> a la semana{r.horas_con_extra ? ` (${r.horas_con_extra} h con tu día extra)` : ""}.
              </p>
              {r.sugerencia && <p className="rounded-xl bg-azul-50 p-4 text-sm text-ink-900">{r.sugerencia}</p>}
              <p className="text-sm text-ink-700">
                Publicas a las <strong>{r.publicar.hora}</strong>. {r.publicar.por_que}.
              </p>
            </Card>

            <Card className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 text-sm font-extrabold">
                <Lightbulb className="size-4" aria-hidden /> Consejos para tus grabaciones
              </h2>
              <ul className="list-disc pl-5 text-sm text-ink-700">{r.consejos.map((c) => <li key={c}>{c}</li>)}</ul>
            </Card>

            <Card>
              <details>
                <summary className="cursor-pointer text-sm font-extrabold">Tus recordatorios</summary>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-700">
                  {r.recordatorios.map((x, i) => (
                    <li key={i}>
                      <span className="font-semibold capitalize">{x.cuando}</span> · {x.texto}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-ink-500">Los avisos llegan como notificación cuando activemos los recordatorios.</p>
              </details>
            </Card>

            {!accepted && (
              <form action={acceptScheduleAction}>
                <Button type="submit" size="lg">
                  Aceptar este horario
                </Button>
              </form>
            )}
            <Link href="/mi-marca/horario?editar=1" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
              Cambiar mis respuestas
            </Link>
          </>
        )
      )}
    </div>
  );
}
