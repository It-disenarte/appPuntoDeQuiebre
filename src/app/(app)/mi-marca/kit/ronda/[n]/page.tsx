import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { getOverview } from "@/lib/brujula/service";
import { lookFromChoices } from "@/lib/kit/look";
import { manualPalettes, manualTitleStyles } from "@/lib/kit/mock";
import { stageUrl } from "@/lib/kit/stage";
import type { FontOption, PaletteOption, TitleOption } from "@/lib/kit/schemas";
import { MANUAL_FONT_LISTS, getHook, getKit, kitStage, MAX_REFRESH, ROUND_TITLES } from "@/lib/kit/service";
import { ElementsForm, RoundForm, StartRound } from "./RoundForm";

export const metadata: Metadata = { title: "Kit visual" };

const INTRO: Record<number, string> = {
  1: "Mira tu portada de reel con dos paletas. Elige la que más se parezca a ti.",
  2: "Ahora afinamos la que elegiste: cuatro variantes que cambian solo el fondo o el acento.",
  3: "Tu frase escrita con cuatro pares de letras: una para titular y otra para leer.",
  4: "Así se vería tu título sobre un reel. Puedes elegir 1 o 2 estilos.",
  5: "Detalles simples para tus piezas, pintados con tu acento. Elige hasta 2, o ninguno.",
};

export default async function RondaPage({ params }: PageProps<"/mi-marca/kit/ronda/[n]">) {
  const n = Number((await params).n);
  if (!Number.isInteger(n) || n < 1 || n > 5) notFound();
  const { user } = await requireCreatorAccess();
  const [kit, overview, hook] = await Promise.all([getKit(user.id), getOverview(user.id), getHook(user.id)]);

  // No se puede saltar a una ronda cuyas anteriores no están elegidas.
  const stage = kitStage(kit);
  if (typeof stage === "number" && n > stage) redirect(stageUrl(stage));

  const chosen = (k: 1 | 2 | 3 | 4) => (kit.state[`r${k}` as "r1"]?.chosen ?? []) as unknown[];
  const look = lookFromChoices({
    palette: (chosen(2)[0] ?? chosen(1)[0]) as PaletteOption | undefined,
    fonts: chosen(3)[0] as FontOption | undefined,
    title: chosen(4)[0] as TitleOption | undefined,
    elementos: kit.state.elementos,
  });
  const round = n <= 4 ? kit.state[`r${n}` as "r1"] : undefined;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Steps overview={overview} current="kit" />
      <PageHeader eyebrow={`Ronda ${n} de 5`} title={ROUND_TITLES[n]!} />
      <p className="text-ink-700">{INTRO[n]}</p>
      {kit.mock && <p className="rounded-xl bg-naranja-100 p-3 text-xs text-ink-900">Versión de prueba: opciones generadas con reglas, no con IA.</p>}

      <Card className="flex flex-col gap-4">
        {n === 5 ? (
          <ElementsForm look={look} initial={kit.state.elementos ?? []} />
        ) : !round || round.tandas.length === 0 ? (
          <StartRound n={n} />
        ) : (
          <RoundForm
            n={n as 1 | 2 | 3 | 4}
            tandas={round.tandas as (PaletteOption | FontOption | TitleOption)[][]}
            look={look}
            hook={hook}
            refreshes={round.refreshes}
            maxRefresh={MAX_REFRESH}
            manual={{ presets: manualPalettes().map((p) => ({ id: p.id, nombre: p.nombre })), styles: manualTitleStyles().map((s) => ({ id: s.id, nombre: s.nombre })), titleFonts: MANUAL_FONT_LISTS.titulos as string[], textFonts: MANUAL_FONT_LISTS.texto }}
          />
        )}
      </Card>
      <Link href="/mi-marca/kit" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
        Ver todas las rondas
      </Link>
    </div>
  );
}
