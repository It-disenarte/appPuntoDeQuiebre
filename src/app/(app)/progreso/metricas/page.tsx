import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, cn, PageHeader } from "@/components/ui";
import { ConfirmForm } from "@/components/metrics/ConfirmForm";
import { Poller } from "@/components/metrics/Poller";
import { ReportView } from "@/components/metrics/ReportView";
import { ShotUploader } from "@/components/metrics/ShotUploader";
import { WhereToFind } from "@/components/metrics/WhereToFind";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { resetReportAction, retryReportAction } from "@/lib/metrics/actions";
import { getReport, isStuck, isValidPeriod, parseConfirmed, parseExplanation, parseExtracted, periodOptions } from "@/lib/metrics/service";

export const metadata: Metadata = { title: "Mis métricas" };

export default async function MetricasPage({ searchParams }: PageProps<"/progreso/metricas">) {
  const { user } = await requireCreatorAccess();
  const params = await searchParams;
  const options = periodOptions();
  const period = typeof params.mes === "string" && isValidPeriod(params.mes) ? params.mes : options[0]!.period;
  const report = await getReport(user.id, period);
  const label = options.find((o) => o.period === period)!.label;
  const extracted = report ? parseExtracted(report.extracted) : null;
  const confirmed = report ? parseConfirmed(report.confirmed) : null;
  const explanation = report ? parseExplanation(report.explanation) : null;
  const shots = report && Array.isArray(report.shotKeys) ? (report.shotKeys as unknown[]).length : 0;
  const status = report?.status ?? "captura";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {status === "procesando" && <Poller />}
      <PageHeader eyebrow="Progreso" title="Mis métricas" />
      <nav aria-label="Mes" className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Link key={o.period} href={`/progreso/metricas?mes=${o.period}`} aria-current={o.period === period ? "page" : undefined} className={cn("tap inline-flex items-center rounded-full border px-4 text-sm font-semibold", o.period === period ? "border-azul bg-azul text-blanco" : "border-ink-300 bg-blanco hover:bg-ink-100")}>
            {o.label}
          </Link>
        ))}
      </nav>

      {status === "captura" && (
        <>
          <Card className="flex flex-col gap-3">
            <p className="font-extrabold">Cuéntame cómo te fue en {label}</p>
            <p className="text-sm text-ink-700">Mientras conectamos Instagram, nos pasas unas <strong>capturas de pantalla de tus estadísticas</strong> una vez al mes. Las leemos, te explicamos tus números en palabras sencillas y los comparamos contigo misma.</p>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-azul">¿Dónde las encuentro? (paso a paso)</summary>
              <div className="mt-3">
                <WhereToFind />
              </div>
            </details>
          </Card>
          <Card>
            <ShotUploader period={period} count={shots} />
          </Card>
          {report?.status === "captura" && report.error && <p className="text-sm text-alerta">{report.error}</p>}
        </>
      )}

      {status === "error" && (
        <Card className="flex flex-col gap-3">
          <p role="alert" className="font-extrabold text-alerta">No pudimos leer tus capturas</p>
          <p className="text-sm text-ink-700">{report?.error ?? "Algo falló."} Tus capturas siguen guardadas: intenta de nuevo o sube otras.</p>
          <ShotUploader period={period} count={shots} />
        </Card>
      )}

      {status === "procesando" && (
        <Card className="flex flex-col gap-2">
          <p className="font-extrabold">Leyendo tus capturas…</p>
          <p className="text-sm text-ink-700">Tarda un minuto o menos. Puedes salir de esta pantalla: te avisamos cuando esté listo.</p>
          {report && isStuck(report) && (
            <form action={retryReportAction} className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-alerta">Está tardando más de lo normal.</p>
              <input type="hidden" name="periodo" value={period} />
              <Button type="submit" size="sm" variant="outline" className="self-start">
                Reintentar
              </Button>
            </form>
          )}
        </Card>
      )}

      {status === "revision" && extracted && (
        <>
          <Card className="flex flex-col gap-2">
            <p className="font-extrabold">Revisa que leímos bien tus números</p>
            <p className="text-sm text-ink-700">Una IA lee las capturas y a veces se equivoca. Corrige lo que esté mal antes de que te lo explique.</p>
            {report?.mock && <p className="rounded-lg bg-naranja-100 p-3 text-xs text-ink-900">Son cifras de ejemplo: todavía no hay lectura real de capturas.</p>}
            {extracted.notas_lectura.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-ink-600">
                {extracted.notas_lectura.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-ink-500">Periodo que vimos: {extracted.periodo.etiqueta || label}</p>
          </Card>
          <ConfirmForm period={period} values={extracted.cuenta as Record<string, number | null | undefined>} />
        </>
      )}

      {status === "lista" && explanation && confirmed && (
        <>
          <ReportView explanation={explanation} cuenta={confirmed.cuenta} mock={report!.mock} />
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/progreso" className="text-sm font-semibold text-azul underline underline-offset-4">
              Ver mi progreso
            </Link>
            <form action={resetReportAction}>
              <input type="hidden" name="periodo" value={period} />
              <Button type="submit" variant="ghost" size="sm">
                Rehacer este mes con otras capturas
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
