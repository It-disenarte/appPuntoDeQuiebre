import { Check, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, cn, PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { stepDone, STORY_STEPS } from "@/lib/brujula/content";
import { getIntake, getOverview } from "@/lib/brujula/service";

export const metadata: Metadata = { title: "Tu historia" };

export default async function HistoriaPage() {
  const { user } = await requireCreatorAccess();
  const [intake, overview] = await Promise.all([getIntake(user.id), getOverview(user.id)]);
  const story = intake?.story ?? { steps: {} };
  const p = overview.story;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Steps overview={overview} current="historia" />
      <PageHeader eyebrow="Mi marca" title="Tu historia" />
      <p className="text-ink-700">
        Una pregunta a la vez, hablando o escribiendo. Con esto armamos tu brújula y tu perfil de voz. <strong>No tienes que contar nada que no quieras:</strong> cualquier pregunta se puede saltar.
      </p>

      <Card data-tour="historia-progreso" className="p-0">
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <p className="font-extrabold">
            {p.done} de {p.total} preguntas
          </p>
          {p.nextStep ? (
            <ButtonLink data-tour="historia-siguiente" href={`/mi-marca/historia/${p.nextStep}`} size="sm">
              {p.done === 0 ? "Empezar" : "Continuar"}
            </ButtonLink>
          ) : !p.quickDone ? (
            <ButtonLink data-tour="historia-siguiente" href="/mi-marca/historia/elecciones" size="sm">
              Elecciones rápidas
            </ButtonLink>
          ) : (
            <ButtonLink data-tour="historia-siguiente" href="/mi-marca/manual" size="sm">
              Ver mi brújula
            </ButtonLink>
          )}
        </div>
        <div className="mx-5 mt-3 h-2 overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done}>
          <div className="h-full rounded-full bg-azul" style={{ width: `${(p.done / p.total) * 100}%` }} />
        </div>
        <ul className="mt-3 divide-y divide-ink-200">
          {STORY_STEPS.map((s) => {
            const done = stepDone(story, s.id);
            const skipped = s.id === "que_vendes" ? Boolean(story.steps.que_vendes?.skipped) : Boolean(story.steps[s.id]?.skipped);
            return (
              <li key={s.id}>
                <Link href={`/mi-marca/historia/${s.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-ink-100">
                  <span className={cn("grid size-8 place-items-center rounded-full text-sm font-extrabold", done ? "bg-exito text-blanco" : "bg-ink-200 text-ink-700")}>
                    {done ? <Check className="size-4" aria-hidden /> : s.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{s.title}</span>
                    <span className="block truncate text-xs text-ink-500">{skipped ? "Saltada" : done ? "Respondida · toca para cambiarla" : s.minSeconds ? `Mínimo ${s.minSeconds} s o ${s.minWords} palabras` : "Un toque"}</span>
                  </span>
                  <ChevronRight className="size-4 text-ink-400" aria-hidden />
                </Link>
              </li>
            );
          })}
          <li>
            <Link href="/mi-marca/historia/elecciones" className="flex items-center gap-3 px-5 py-4 hover:bg-ink-100">
              <span className={cn("grid size-8 place-items-center rounded-full text-sm font-extrabold", p.quickDone ? "bg-exito text-blanco" : "bg-ink-200 text-ink-700")}>
                {p.quickDone ? <Check className="size-4" aria-hidden /> : 8}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Elecciones rápidas</span>
                <span className="block truncate text-xs text-ink-500">Redes, formatos, tono y cuentas que te inspiran</span>
              </span>
              <ChevronRight className="size-4 text-ink-400" aria-hidden />
            </Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}
