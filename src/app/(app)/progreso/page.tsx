import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import { BgStatus } from "@/components/BgStatus";
import { Button, ButtonLink, Card, Chip, PageHeader } from "@/components/ui";
import { Spark } from "@/components/metrics/Charts";
import { ReportView } from "@/components/metrics/ReportView";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { hadActivityIn, listReports, parseConfirmed, parseExplanation, periodOptions } from "@/lib/metrics/service";
import { forgetLearningAction, runLearningAction } from "@/lib/learning/actions";
import { latestLearning, LEARNING_SCOPE, MIN_SIGNALS } from "@/lib/learning/service";
import { monthName } from "@/lib/notify/rules";

export const metadata: Metadata = { title: "Progreso" };

export default async function ProgresoPage() {
  const { user } = await requireCreatorAccess();
  const reports = (await listReports(user.id)).filter((r) => r.status === "lista");
  const latest = reports.at(-1) ?? null;
  const explanation = latest ? parseExplanation(latest.explanation) : null;
  const confirmed = latest ? parseConfirmed(latest.confirmed) : null;
  const learning = await latestLearning(user.id);
  const pending = periodOptions()[0]!;
  // Solo se pide el informe del mes pasado si ya grabó o publicó algo en ese mes.
  const doneThisMonth = reports.some((r) => r.period === pending.period) || !(await hadActivityIn(user.id, pending.period));

  const series = reports
    .map((r) => ({ label: monthName(r.period), value: Number(parseConfirmed(r.confirmed)?.cuenta.vistas ?? NaN) }))
    .filter((p) => Number.isFinite(p.value));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow={latest ? `Informe de ${monthName(latest.period)}` : "Tus métricas"} title="Tu progreso" />

      {!doneThisMonth && (
        <Card data-tour="informe" className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-naranja">
          <div>
            <p className="font-extrabold">Pásame tus métricas de {monthName(pending.period)}</p>
            <p className="text-sm text-ink-600">Unas capturas de tu perfil y te explico cómo te fue. Te digo dónde encontrarlas.</p>
          </div>
          <ButtonLink href={`/progreso/metricas?mes=${pending.period}`} size="sm">
            Subir capturas
          </ButtonLink>
        </Card>
      )}

      {explanation && confirmed ? (
        <>
          <ReportView explanation={explanation} cuenta={confirmed.cuenta} mock={latest!.mock} />
          {series.length >= 2 && (
            <Card>
              <p className="text-sm font-extrabold">Tus vistas mes a mes</p>
              <Spark points={series} label="Vistas por mes" />
              <p className="mt-1 text-xs text-ink-500">{series.map((s) => s.label).join(" · ")}</p>
            </Card>
          )}
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={`/progreso/metricas?mes=${latest!.period}`} variant="outline" size="sm">
              Ver el informe completo
            </ButtonLink>
          </div>
        </>
      ) : (
        <Card data-tour="informe" className="flex flex-col items-start gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-azul-50 text-azul" aria-hidden>
            <BarChart3 className="size-6" />
          </span>
          <p className="font-extrabold">Todavía no tienes un informe</p>
          <p className="text-sm text-ink-600">Sube las capturas de tus estadísticas de Instagram y te mostramos tu progreso con gráficas sencillas y comparado con tus propios resultados.</p>
          <ButtonLink href="/progreso/metricas" size="sm">
            Empezar mi primer informe
          </ButtonLink>
        </Card>
      )}

      <BgStatus userId={user.id} scope={LEARNING_SCOPE} />
      <Card className="flex flex-col gap-3">
        <div>
          <p className="font-extrabold">Lo que he aprendido de ti</p>
          <p className="text-sm text-ink-600">Reviso lo que calificas, corriges y publicas para que tus próximos guiones suenen cada vez más a ti. Necesito al menos {MIN_SIGNALS} piezas con las que aprender.</p>
        </div>
        {learning ? (
          <div className="flex flex-col gap-2">
            {learning.result.para_el_creador && <p className="text-sm">{learning.result.para_el_creador}</p>}
            {learning.result.suficiente_evidencia && learning.result.resumen && <p className="text-sm text-ink-700">{learning.result.resumen}</p>}
            {learning.result.suficiente_evidencia && learning.result.preferencias_nuevas.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-ink-700">
                {learning.result.preferencias_nuevas.map((p, i) => (
                  <li key={i}>
                    {p.por}. <span className="text-ink-500">{p.motivo}</span>
                  </li>
                ))}
              </ul>
            )}
            {learning.result.suficiente_evidencia && learning.result.pruebas_sugeridas.length > 0 && <p className="text-sm text-ink-700">Para probar esta semana: {learning.result.pruebas_sugeridas[0]}</p>}
            <p className="text-xs text-ink-500">Última revisión: {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" }).format(learning.createdAt)}</p>
          </div>
        ) : (
          <p className="text-sm text-ink-600">Todavía no he revisado nada. Cuando tengas piezas calificadas o publicadas, pulsa el botón.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <form action={runLearningAction}>
            <Button type="submit" size="sm" variant="outline">
              Actualizar lo que aprendí
            </Button>
          </form>
          {learning && (
            <form action={forgetLearningAction}>
              <Button type="submit" size="sm" variant="ghost">
                Olvidar lo aprendido
              </Button>
            </form>
          )}
        </div>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-extrabold">Analizador de competencia</p>
          <p className="text-sm text-ink-600">Descubre por qué funcionan los reels de las cuentas que admiras y llévate ideas con tu voz.</p>
        </div>
        <ButtonLink data-tour="analizador" href="/analizador" variant="outline" size="sm">
          Abrir
        </ButtonLink>
      </Card>

      <Card>
        <Chip>Próximamente</Chip>
        <p className="mt-2 font-extrabold">Pruebas terminadas y qué ganchos funcionan</p>
        <p className="text-sm text-ink-600">Se activa al conectar tu Instagram, para medir cada publicación y cada prueba de gancho.</p>
      </Card>
    </div>
  );
}
