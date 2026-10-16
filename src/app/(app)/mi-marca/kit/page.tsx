import { Check, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, ButtonLink, Card, Chip, cn, PageHeader } from "@/components/ui";
import { ElementGlyph, Swatches } from "@/components/kit/KitPreview";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { getOverview } from "@/lib/brujula/service";
import { fillDefaultsAction, resetKitAction } from "@/lib/kit/actions";
import { stageUrl } from "@/lib/kit/stage";
import { ELEMENTS } from "@/lib/kit/schemas";
import { getKit, kitProgress, ROUND_TITLES, type KitStage } from "@/lib/kit/service";

export const metadata: Metadata = { title: "Mi kit visual" };

export default async function KitPage({ searchParams }: PageProps<"/mi-marca/kit">) {
  const { user } = await requireCreatorAccess();
  const params = await searchParams;
  const [kit, overview] = await Promise.all([getKit(user.id), getOverview(user.id)]);
  const p = kitProgress(kit);
  const done = (n: number) => (n <= 4 ? Boolean(kit.state[`r${n}` as "r1"]?.chosen) : Boolean(kit.state.elementos));
  const current = p.stage as KitStage;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Steps overview={overview} current="kit" />
      <PageHeader eyebrow="Mi marca" title="Tu kit visual" />
      <p className="text-ink-700">
        Eliges jugando lo mínimo para que tus reels y carruseles se vean siempre como tú: <strong>4 colores, 2 tipografías, el estilo de tus títulos y hasta 2 elementos</strong>. Son 5 rondas rápidas y una revelación final con tus propias fotos.
      </p>
      {params.error && <p role="alert" className="rounded-xl bg-alerta-100 p-4 text-sm font-semibold text-alerta">No pudimos completar el kit con la IA. Intenta de nuevo en un momento.</p>}
      {kit.mock && <p className="rounded-xl bg-naranja-100 p-4 text-sm text-ink-900"><strong>Versión de prueba.</strong> Las opciones las arma un generador de reglas, no la IA. Úsalo para conocer el proceso.</p>}

      {p.approved && kit.final ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="font-extrabold">Tu kit está listo</p>
            <Chip tone="exito">Aprobado</Chip>
          </div>
          <p className="text-sm text-ink-700">{kit.final.mensaje_al_creador}</p>
          <Swatches colores={kit.final.colores} />
          <p className="text-sm">
            <span style={{ fontFamily: `"${kit.final.tipografias.titulos.familia}", sans-serif`, fontSize: 22 }}>{kit.final.tipografias.titulos.familia}</span>
            <span className="text-ink-500"> + </span>
            <span style={{ fontFamily: `"${kit.final.tipografias.texto.familia}", sans-serif` }}>{kit.final.tipografias.texto.familia}</span>
          </p>
          <div className="flex gap-3">
            {kit.final.elementos.map((e) => (
              <span key={e.id} title={ELEMENTS.find((x) => x.id === e.id)?.label} className="grid size-11 place-items-center rounded-xl bg-ink-100">
                <ElementGlyph id={e.id} color={e.color === kit.final!.colores.fondo ? "#09080D" : e.color} size={28} />
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/mi-marca/kit/revelacion" variant="outline" size="sm">
              Ver mis piezas
            </ButtonLink>
            <form action={resetKitAction}>
              <Button type="submit" variant="ghost" size="sm">
                Rehacer mi kit
              </Button>
            </form>
          </div>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="flex items-center justify-between gap-3 px-5 pt-5">
            <p className="font-extrabold">
              {p.roundsDone} de {p.roundsTotal} rondas
            </p>
            <ButtonLink href={stageUrl(current)} size="sm">
              {p.roundsDone === 0 ? "Empezar" : "Continuar"}
            </ButtonLink>
          </div>
          <div className="mx-5 mt-3 h-2 overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={p.roundsDone}>
            <div className="h-full rounded-full bg-azul" style={{ width: `${(p.roundsDone / 5) * 100}%` }} />
          </div>
          <ul className="mt-3 divide-y divide-ink-200">
            {[1, 2, 3, 4, 5].map((n) => (
              <li key={n}>
                <Link href={`/mi-marca/kit/ronda/${n}`} className="flex items-center gap-3 px-5 py-4 hover:bg-ink-100">
                  <span className={cn("grid size-8 place-items-center rounded-full text-sm font-extrabold", done(n) ? "bg-exito text-blanco" : "bg-ink-200 text-ink-700")}>{done(n) ? <Check className="size-4" aria-hidden /> : n}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{ROUND_TITLES[n]}</span>
                    <span className="block truncate text-xs text-ink-500">{done(n) ? "Elegida · toca para cambiarla" : n === 5 ? "Hasta 2 elementos simples" : "Elige entre varias opciones"}</span>
                  </span>
                  <ChevronRight className="size-4 text-ink-400" aria-hidden />
                </Link>
              </li>
            ))}
            <li>
              <Link href="/mi-marca/kit/revelacion" className="flex items-center gap-3 px-5 py-4 hover:bg-ink-100">
                <span className="grid size-8 place-items-center rounded-full bg-ink-200 text-sm font-extrabold text-ink-700">6</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Revelación con tus fotos</span>
                  <span className="block truncate text-xs text-ink-500">Subes 3 o 4 fotos y calificas tus portadas</span>
                </span>
                <ChevronRight className="size-4 text-ink-400" aria-hidden />
              </Link>
            </li>
          </ul>
          {p.roundsDone > 0 && p.roundsDone < 5 && (
            <form action={fillDefaultsAction} className="px-5 pb-5 pt-2">
              <Button type="submit" variant="ghost" size="sm">
                Terminar con las opciones recomendadas
              </Button>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
