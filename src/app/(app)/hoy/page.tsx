import { Camera, Flame } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, Chip, cn, PageHeader } from "@/components/ui";
import { StoryCard } from "@/components/plan/StoryCard";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { getOverview, getSchedule } from "@/lib/brujula/service";
import { blockRange, dayLabel } from "@/lib/brujula/schedule";
import { addDays, CATEGORY_LABEL, DAY_CODES, DAY_SHORT, dowMon0, mondayOf, todayIso } from "@/lib/plan/rules";
import { currentStory, getCurrentPlan } from "@/lib/plan/service";
import { listReports, periodOptions } from "@/lib/metrics/service";
import { monthName } from "@/lib/notify/rules";

export const metadata: Metadata = { title: "Hoy" };

export default async function HoyPage() {
  const { user } = await requireCreatorAccess();
  const firstName = user.name.split(" ")[0];
  const today = todayIso();
  const [overview, data, schedule] = await Promise.all([getOverview(user.id), getCurrentPlan(user.id, today), getSchedule(user.id)]);
  const nextStep = overview.next;
  // Recordatorio mensual: si todavía no entrega las métricas del mes pasado, un botón lleva directo a subir las capturas.
  const metricPeriod = periodOptions(today)[0]!.period;
  const metricsPending = !(await listReports(user.id)).some((r) => r.period === metricPeriod && r.status === "lista");

  const pieces = data?.pieces ?? [];
  const stories = data?.stories ?? [];
  const todays = pieces.filter((p) => p.day === today && p.status !== "descartado");
  const upcoming = pieces.filter((p) => p.day > today && p.status === "pendiente").sort((a, b) => (a.day < b.day ? -1 : 1))[0] ?? null;
  const story = stories.find((s) => s.day === today) ?? null;
  const storyView = story ? currentStory(story) : null;

  // Racha de la semana: un día cuenta si grabó o publicó una pieza, o marcó su historia como hecha. (La verificación por API de Instagram llega con la conexión.)
  const monday = mondayOf(today);
  const doneDay = (iso: string) => pieces.some((p) => p.day === iso && ["grabado", "programado", "publicado"].includes(p.status)) || stories.some((s) => s.day === iso && s.done);
  const week = DAY_CODES.map((_, i) => {
    const iso = addDays(monday, i);
    return { iso, d: DAY_SHORT[i]!.slice(0, 1), state: iso === today ? ("today" as const) : iso < today ? (doneDay(iso) ? ("done" as const) : ("missed" as const)) : ("future" as const) };
  });
  let streak = 0;
  for (let i = dowMon0(today); i >= 0; i--) {
    const iso = addDays(monday, i);
    if (doneDay(iso)) streak += 1;
    else if (iso !== today) break;
  }

  // Próxima sesión de grabación según su horario (bloques fijos).
  const blocks = (schedule?.result.bloques ?? []).filter((b) => b.tipo === "fijo" && b.dia && b.inicio);
  const nextBlock = blocks
    .map((b) => {
      const idx = DAY_CODES.indexOf(b.dia as (typeof DAY_CODES)[number]);
      const delta = (idx - dowMon0(today) + 7) % 7;
      return { b, date: addDays(today, delta), delta };
    })
    .sort((a, b) => a.delta - b.delta)[0];
  const readyScripts = pieces.filter((p) => p.kind === "video" && p.status === "pendiente").length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={`Hola, ${firstName}`}
        title="Tu día"
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-naranja px-3.5 py-2 text-sm font-extrabold text-negro">
            <Flame className="size-4" aria-hidden /> {streak} {streak === 1 ? "día" : "días"}
          </span>
        }
      />
      {metricsPending && !nextStep && (
        <Card data-tour="metricas-pendientes" className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-naranja">
          <div>
            <p className="font-extrabold">Pásame tus métricas de {monthName(metricPeriod)}</p>
            <p className="text-sm text-ink-600">Unas capturas de las estadísticas de tu Instagram y te explico cómo te fue. Te digo dónde encontrarlas.</p>
          </div>
          <ButtonLink href={`/progreso/metricas?mes=${metricPeriod}`} size="sm">
            Subir mis capturas
          </ButtonLink>
        </Card>
      )}
      {nextStep && (
        <Card data-tour="siguiente-paso" className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-azul">
          <div>
            <p className="font-extrabold">Lo primero: arma tu marca</p>
            <p className="text-sm text-ink-600">
              {overview.stepsDone} de {overview.stepsTotal} pasos listos. Con ella tus guiones sonarán a ti.
            </p>
          </div>
          <ButtonLink data-tour="siguiente-paso-boton" href={nextStep.href} size="sm">
            {nextStep.text}
          </ButtonLink>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card data-tour="racha" className="py-4">
            <ol className="grid grid-cols-7 text-center" aria-label="Racha de esta semana">
              {week.map((w, i) => (
                <li key={i} className="flex flex-col items-center gap-2">
                  <span className={cn("text-xs", w.state === "today" ? "font-extrabold text-ink-900" : "text-ink-500")}>{w.d}</span>
                  <span
                    className={cn("size-8 rounded-full", w.state === "done" && "bg-naranja", w.state === "today" && "border-[2.5px] border-azul", (w.state === "future" || w.state === "missed") && "bg-ink-200")}
                    aria-label={w.state === "done" ? "cumplido" : w.state === "today" ? "hoy" : w.state === "missed" ? "sin actividad" : "pendiente"}
                  />
                </li>
              ))}
            </ol>
          </Card>

          {todays.length > 0 ? (
            todays.map((p) => (
              <section key={p.id} data-tour="tarea" className="relative overflow-hidden rounded-card bg-azul p-6 text-blanco">
                <p className="rotulo text-azul-100">Tarea de hoy</p>
                <h2 className="font-display mt-3 text-3xl lg:text-4xl">
                  {p.kind === "video" ? "Publica tu video" : "Publica tu carrusel"}: {p.topic}
                </h2>
                <div className="mt-4 flex gap-2">
                  <Chip tone="invert">{CATEGORY_LABEL[p.category]}</Chip>
                  <Chip tone="outlineLight">{p.type === "prueba" ? "Prueba" : "Probado"}</Chip>
                </div>
                <p className="mt-4 text-sm text-azul-100">A las {p.publishTime} h</p>
                <ButtonLink href={`/semana/${p.id}`} variant="light" className="mt-5">
                  Ver guion y textos
                </ButtonLink>
              </section>
            ))
          ) : (
            <Card data-tour="tarea">
              <p className="text-xs text-ink-500">Tarea de hoy</p>
              {data ? (
                <p className="mt-2 font-semibold">{upcoming ? `Hoy no publicas. Lo siguiente: ${upcoming.topic}.` : "Hoy no tienes nada que publicar."}</p>
              ) : (
                <p className="mt-2 font-semibold">Todavía no tienes parrilla para esta semana.</p>
              )}
              <ButtonLink href="/semana" variant="outline" size="sm" className="mt-3">
                {data ? "Ver mi semana" : "Armar mi semana"}
              </ButtonLink>
            </Card>
          )}

          {storyView && story ? (
            <div data-tour="historia" className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Camera className="size-4" aria-hidden /> Historia del día
              </p>
              <StoryCard id={story.id} dayLabel="Hoy" tipo={storyView.tipo} idea={storyView.idea} texto={storyView.texto} sticker={storyView.sticker} minutos={storyView.minutos} own={storyView.own} vote={story.vote} done={story.done} mode="rapido" />
            </div>
          ) : (
            <Card data-tour="historia" className="flex items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-naranja-100 text-ink-900">
                <Camera className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-500">Historia del día</p>
                <p className="font-semibold">Tus ideas llegan con tu parrilla semanal.</p>
              </div>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card data-tour="sesion">
            <p className="text-xs text-ink-500">Tu próxima sesión de grabación</p>
            {nextBlock ? (
              <>
                <p className="mt-2 text-lg font-extrabold">
                  {nextBlock.delta === 0 ? "Hoy" : dayLabel(nextBlock.b.dia)} · {blockRange(nextBlock.b)}
                </p>
                <p className="mt-1 text-sm text-ink-500">{readyScripts} {readyScripts === 1 ? "guion listo" : "guiones listos"}</p>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-600">Define tu horario para que te avisemos cuándo grabar.</p>
                <Link href="/mi-marca/horario" className="mt-2 inline-block text-sm font-semibold text-azul underline underline-offset-4">
                  Definir mi horario
                </Link>
              </>
            )}
            <ButtonLink data-tour={nextStep ? undefined : "ir-estudio"} href="/grabar" variant="dark" className="mt-4">
              Ir al estudio
            </ButtonLink>
          </Card>
          <p className="px-2 text-center text-sm text-ink-500 italic">“Cada video te acerca a quien necesita escucharte.”</p>
        </div>
      </div>
    </div>
  );
}
