import { Check, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, cn, PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { BLOCKS } from "@/lib/brujula/content";
import { getBrujula, getOverview } from "@/lib/brujula/service";

export const metadata: Metadata = { title: "Mi brújula" };

export default async function BrujulaPage() {
  const { user } = await requireCreatorAccess();
  const [form, overview] = await Promise.all([getBrujula(user.id), getOverview(user.id)]);
  const done = new Set(form?.completedBlocks ?? []);
  const { progress } = overview;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Steps overview={overview} current="brujula" />
      <PageHeader eyebrow="Mi marca" title="Tu brújula" />
      <p className="text-ink-700">Seis bloques cortos para conocerte. Puedes pausar y continuar cuando quieras: lo que ya respondiste se guarda.</p>

      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <p className="font-extrabold">
            {progress.done} de {progress.total} bloques
          </p>
          {progress.nextBlock ? (
            <ButtonLink href={`/mi-marca/brujula/${progress.nextBlock}`} size="sm">
              {progress.done === 0 ? "Empezar" : "Continuar"}
            </ButtonLink>
          ) : (
            <ButtonLink href="/mi-marca/voz" size="sm">
              Seguir con mi voz
            </ButtonLink>
          )}
        </div>
        <div className="mx-5 mt-3 h-2 overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
          <div className="h-full rounded-full bg-azul" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
        <ul className="mt-3 divide-y divide-ink-200">
          {BLOCKS.map((b, i) => (
            <li key={b.id}>
              <Link href={`/mi-marca/brujula/${b.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-ink-100">
                <span className={cn("grid size-8 place-items-center rounded-full text-sm font-extrabold", done.has(b.id) ? "bg-exito text-blanco" : "bg-ink-200 text-ink-700")}>
                  {done.has(b.id) ? <Check className="size-4" aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{b.title}</span>
                  <span className="block truncate text-xs text-ink-500">{done.has(b.id) ? "Completado · toca para editar" : `${b.minutes} min`}</span>
                </span>
                <ChevronRight className="size-4 text-ink-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {progress.complete && (
        <Card>
          <p className="font-extrabold">Brújula completa</p>
          <p className="mt-1 text-sm text-ink-600">Ya puedes ver tu manual de identidad. Suma tu voz y tu horario para completarlo.</p>
          <ButtonLink href="/mi-marca/manual" variant="outline" size="sm" className="mt-3">
            Ver mi manual
          </ButtonLink>
        </Card>
      )}
    </div>
  );
}
