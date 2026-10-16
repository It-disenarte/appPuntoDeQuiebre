import { Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, Chip, FormSuccess, PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { acceptScheduleAction } from "@/lib/brujula/actions";
import { getOverview, getSchedule } from "@/lib/brujula/service";
import { dayLabel, endTime } from "@/lib/brujula/schedule";
import { AdjustForm, ScheduleQuestions } from "./ScheduleForms";

export const metadata: Metadata = { title: "Mi horario" };

const TIMES = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "19:30", "20:00", "21:00"];

export default async function HorarioPage({ searchParams }: PageProps<"/mi-marca/horario">) {
  const { user } = await requireCreatorAccess();
  const params = await searchParams;
  const [schedule, overview] = await Promise.all([getSchedule(user.id), getOverview(user.id)]);
  const editing = params.editar === "1" || !schedule;
  const accepted = Boolean(schedule?.acceptedAt);
  const times = schedule ? [...new Set([...TIMES, ...schedule.proposal.blocks.map((b) => b.start)])].sort() : TIMES;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Steps overview={overview} current="horario" />
      <PageHeader eyebrow="Mi marca" title="Tu horario de grabación" />
      <FormSuccess message={params.listo ? "Horario guardado." : undefined} />

      {editing ? (
        <>
          <p className="text-ink-700">Cinco preguntas rápidas y te proponemos 2 bloques de grabación por semana, más uno de respaldo.</p>
          <ScheduleQuestions initial={schedule?.answers ?? null} />
        </>
      ) : (
        <>
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-extrabold">{accepted ? "Tu horario" : "Esta es nuestra propuesta"}</p>
              {accepted ? <Chip tone="exito">{schedule!.adjusted ? "Ajustado por ti" : "Aceptado"}</Chip> : <Chip tone="naranja">Falta tu confirmación</Chip>}
            </div>
            <ul className="flex flex-col gap-3">
              {schedule!.proposal.blocks.map((b, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-ink-100 px-4 py-3">
                  <div>
                    <p className="font-semibold">{dayLabel(b.day)}</p>
                    <p className="text-sm text-ink-600">
                      {b.start} a {endTime(b.start, b.minutes)} h
                    </p>
                  </div>
                  <Chip tone={b.kind === "respaldo" ? "neutral" : "azul"}>{b.kind === "respaldo" ? "Respaldo" : "Grabación"}</Chip>
                </li>
              ))}
            </ul>
            <div>
              <p className="text-sm font-semibold">Por qué te lo proponemos</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-700">
                {schedule!.proposal.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            {schedule!.proposal.lightingAdvice && (
              <p className="flex gap-3 rounded-xl bg-naranja-100 p-4 text-sm text-ink-900">
                <Lightbulb className="mt-0.5 size-5 shrink-0" aria-hidden />
                {schedule!.proposal.lightingAdvice}
              </p>
            )}
            {!accepted && (
              <form action={acceptScheduleAction}>
                <Button type="submit" size="lg">
                  Aceptar esta propuesta
                </Button>
              </form>
            )}
          </Card>

          <Card>
            <details>
              <summary className="cursor-pointer font-semibold">Ajustar días y horas</summary>
              <div className="mt-4">
                <AdjustForm blocks={schedule!.proposal.blocks} times={times} />
              </div>
            </details>
          </Card>
          <Link href="/mi-marca/horario?editar=1" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
            Cambiar mis respuestas
          </Link>
        </>
      )}
    </div>
  );
}
