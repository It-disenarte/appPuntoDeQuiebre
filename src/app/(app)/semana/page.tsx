import { Film, GalleryHorizontal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, Chip, cn, PageHeader } from "@/components/ui";
import { GenerateWeek } from "@/components/plan/GenerateWeek";
import { StoryCard } from "@/components/plan/StoryCard";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { getManual } from "@/lib/brujula/service";
import { addDays, CATEGORY_LABEL, DAY_NAMES, DAY_SHORT, dowMon0, STAGE_LABEL, targetWeek, todayIso } from "@/lib/plan/rules";
import { currentStory, getCurrentPlan, getPlan, listWeeks, mixSchema, planReadiness } from "@/lib/plan/service";

export const metadata: Metadata = { title: "Semana" };

const STATUS = {
  pendiente: { label: "Pendiente", tone: "neutral" },
  grabado: { label: "Grabado", tone: "azul" },
  programado: { label: "Programado", tone: "azul" },
  publicado: { label: "Publicado", tone: "exito" },
  descartado: { label: "Descartado", tone: "neutral" },
} as const;
const MIX_COLOR = { viral: "bg-azul", nicho: "bg-negro", conversion: "bg-naranja" } as const;

const monthName = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", month: "long" }).format(new Date(`${iso}T00:00:00Z`));
const dayNum = (iso: string) => Number(iso.slice(8, 10));

export default async function SemanaPage({ searchParams }: PageProps<"/semana">) {
  const { user } = await requireCreatorAccess();
  const params = await searchParams;
  const today = todayIso();
  const asked = typeof params.s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.s) ? params.s : null;
  const [data, readiness] = await Promise.all([asked ? getPlan(user.id, asked) : getCurrentPlan(user.id, today), planReadiness(user.id)]);
  const nextWeek = targetWeek(today);

  // Sin semana todavía: pedir lo que falta o generar.
  if (!data) {
    const manual = await getManual(user.id);
    const topics = (manual?.content.pilares ?? []).slice(0, 5).map((p) => p.nombre.slice(0, 28));
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <PageHeader eyebrow={`Semana del ${dayNum(nextWeek)} al ${dayNum(addDays(nextWeek, 6))} de ${monthName(addDays(nextWeek, 6))}`} title="Tu parrilla" />
        {readiness.ready ? (
          <Card data-tour="generar" className="flex flex-col gap-4">
            <p className="font-extrabold">Armemos tu semana</p>
            <p className="text-sm text-ink-700">Te daremos tus videos y carruseles de la semana, cada uno con su guion escrito con tu voz, más una idea de historia por día.</p>
            <GenerateWeek week={nextWeek} topics={topics} label="Generar mi semana" />
          </Card>
        ) : (
          <Card className="flex flex-col gap-3">
            <p className="font-extrabold">Antes de armar tu semana</p>
            <p className="text-sm text-ink-700">Tu parrilla se escribe con tu brújula, tu voz y tu horario. Te falta:</p>
            <ul className="flex flex-col gap-2">
              {readiness.missing.map((m) => (
                <li key={m.href}>
                  <ButtonLink href={m.href} variant="outline" size="sm">
                    {m.text}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    );
  }

  const { plan, pieces, stories } = data;
  const mix = mixSchema.safeParse(plan.mix);
  // Las primeras 2 semanas se pide el voto de las ideas de historias; después la idea solo llega (skill 7, regla 10).
  const weeksCount = (await listWeeks(user.id)).length;
  const storyByDay = new Map(stories.map((s) => [s.day, s]));
  const mode = weeksCount > 2 ? ("rapido" as const) : ("aprendizaje" as const);
  const variantTest = pieces.find((p) => p.type === "prueba");
  const canNext = !asked && data.plan.weekStart <= today && (await getPlan(user.id, nextWeek)) === null && dowMon0(today) >= 2;
  const manual = canNext ? await getManual(user.id) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={`Semana del ${dayNum(plan.weekStart)} al ${dayNum(addDays(plan.weekStart, 6))} de ${monthName(addDays(plan.weekStart, 6))}`} title="Tu parrilla" />
      {plan.mock && <p className="rounded-xl bg-naranja-100 p-3 text-xs text-ink-900">Versión de prueba: los guiones los arma un generador de reglas, no la IA.</p>}

      <Card data-tour="mezcla">
        <p className="text-xs text-ink-500">Mezcla de esta semana · Etapa de {STAGE_LABEL[plan.stage].toLowerCase()}</p>
        {mix.success && (
          <>
            <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Viral ${mix.data.viral} %, nicho ${mix.data.nicho} %, conversión ${mix.data.conversion} %`}>
              {(["viral", "nicho", "conversion"] as const).map((c) => (mix.data[c] > 0 ? <span key={c} className={MIX_COLOR[c]} style={{ width: `${mix.data[c]}%` }} /> : null))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700">
              {(["viral", "nicho", "conversion"] as const).map((c) => (
                <li key={c} className="flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-sm", MIX_COLOR[c])} aria-hidden /> {CATEGORY_LABEL[c]} {mix.data[c]} %
                </li>
              ))}
            </ul>
          </>
        )}
        {plan.summary && <p className="mt-3 text-sm text-ink-700">{plan.summary}</p>}
      </Card>

      <ol data-tour="piezas" className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {pieces.map((p) => {
          const idx = dowMon0(p.day);
          const isToday = p.day === today;
          const st = STATUS[p.status];
          const Icon = p.kind === "video" ? Film : GalleryHorizontal;
          return (
            <li key={p.id}>
              <Link href={`/semana/${p.id}`} className="block">
                <Card className={cn("tap flex items-center gap-4 px-4 py-3.5", isToday && "ring-2 ring-azul")} aria-current={isToday ? "date" : undefined}>
                  <div className={cn("w-10 shrink-0 text-center", isToday ? "text-azul" : "text-ink-500")}>
                    <p className="text-xs">{DAY_SHORT[idx]}</p>
                    <p className={cn("text-lg font-extrabold", !isToday && "text-ink-900")}>{dayNum(p.day)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold">
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{p.type === "prueba" ? "Variante · " : ""}{p.topic}</span>
                    </p>
                    <p className="text-xs text-ink-500">
                      {CATEGORY_LABEL[p.category]} · {p.type === "prueba" ? "Prueba" : "Probado"} · {p.publishTime} h
                    </p>
                  </div>
                  <Chip tone={st.tone}>{st.label}</Chip>
                </Card>
              </Link>
            </li>
          );
        })}
      </ol>

      {variantTest?.testCard && <p className="rounded-2xl bg-naranja-100 px-4 py-3 text-sm text-ink-900">{variantTest.testCard}</p>}

      <section data-tour="historias" aria-labelledby="historias" className="flex flex-col gap-3">
        <h2 id="historias" className="text-lg font-extrabold">
          Tus historias de la semana
        </h2>
        <p className="text-sm text-ink-600">Una idea por día, de menos de 5 minutos. Son solo sugerencias: si ese día haces algo que te emocione, compártelo; también cuenta para tu racha.</p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {DAY_NAMES.map((name, i) => {
            const iso = addDays(plan.weekStart, i);
            const row = storyByDay.get(iso);
            const cur = row ? currentStory(row) : null;
            if (!row || !cur) return null;
            return <StoryCard key={row.id} id={row.id} dayLabel={`${name} ${dayNum(iso)}`} tipo={cur.tipo} idea={cur.idea} texto={cur.texto} sticker={cur.sticker} minutos={cur.minutos} own={cur.own} vote={row.vote} done={row.done} mode={mode} />;
          })}
        </div>
      </section>

      {canNext && (
        <Card className="flex flex-col gap-3">
          <p className="font-extrabold">¿Armamos la semana que sigue?</p>
          <GenerateWeek week={nextWeek} topics={(manual?.content.pilares ?? []).slice(0, 5).map((p) => p.nombre.slice(0, 28))} label="Generar la semana siguiente" />
        </Card>
      )}
      {asked && (
        <Link href="/semana" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
          Volver a la semana actual
        </Link>
      )}
    </div>
  );
}

