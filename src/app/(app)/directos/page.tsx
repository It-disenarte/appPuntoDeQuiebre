import type { Metadata } from "next";
import { AnswersForm, GenerateWeekForm, SupportForm } from "@/components/lives/LiveForms";
import { Button, Card, Chip, PageHeader } from "@/components/ui";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { changeAnswerAction, dismissNoticeAction, enableNoticeAction, markDoneAction } from "@/lib/lives/actions";
import { PLATFORMS, SITUATIONS, type Live } from "@/lib/lives/schemas";
import { getLiveProfile, getWeekGuide, listSupport, parseAnswers, parseDone, parseGuide, parseRecommendation, showMonthlyNotice, type GuideRow } from "@/lib/lives/service";
import { DAY_NAMES, dowMon0, targetWeek } from "@/lib/plan/rules";
import { BgStatus } from "@/components/BgStatus";

export const metadata: Metadata = { title: "Directos" };

const platformLabel = (id: string) => PLATFORMS.find((p) => p.id === id)?.label ?? id;
const dayLabel = (iso: string) => `${DAY_NAMES[dowMon0(iso)]} ${Number(iso.slice(8, 10))}`;

function LiveCard({ l, guide }: { l: Live; guide: GuideRow }) {
  const done = parseDone(guide.done)[l.dia];
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={l.tipo === "ancla" ? "azul" : "neutral"}>{l.tipo === "ancla" ? "Con guía" : "Libre"}</Chip>
        <span className="text-sm font-semibold">{dayLabel(l.dia)}</span>
        {l.plataforma && <span className="text-xs text-ink-500">{platformLabel(l.plataforma)}</span>}
        {done && <Chip tone="exito">Hecho ✓</Chip>}
      </div>
      <h3 className="text-lg font-extrabold">{l.titulo}</h3>
      {l.tipo === "ancla" ? (
        <div className="flex flex-col gap-3 text-sm">
          {l.pilar && <p className="text-xs text-ink-500">Pilar: {l.pilar}</p>}
          <p>
            <strong>Apertura:</strong> {l.apertura}
          </p>
          <div>
            <strong>Puntos para hablar</strong>
            <ul className="list-disc pl-5">
              {l.puntos_para_hablar.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
          {l.preguntas_para_el_publico.length > 0 && (
            <div>
              <strong>Preguntas para el público</strong>
              <ul className="list-disc pl-5">
                {l.preguntas_para_el_publico.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {l.dinamica && (
            <p>
              <strong>Dinámica — {l.dinamica.nombre}:</strong> {l.dinamica.como_se_juega}
            </p>
          )}
          {l.si_llega_hate && (
            <p>
              <strong>Si llega un comentario feo:</strong> {l.si_llega_hate}
            </p>
          )}
          <p>
            <strong>Cierre:</strong> {l.cierre}
          </p>
          {l.momento_clip && (
            <div className="rounded-xl bg-azul-50 p-3">
              <p className="font-semibold">🎬 Momento para clip</p>
              <p>{l.momento_clip.pregunta}</p>
              <p className="text-xs text-ink-600">Antes de responder di “{l.momento_clip.frase_marca}”. {l.momento_clip.como_decirlo}</p>
              {l.clip_para_reel && <p className="mt-1 text-xs text-ink-600">{l.clip_para_reel}</p>}
              <p className="mt-1 text-xs text-ink-500">Graba tu directo y sube el clip tú cuando quieras. En el plan Pro podrás pasárnoslo para editarlo.</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-600">Este día es tuyo: sin guion, a tu estilo.</p>
      )}
      <form action={markDoneAction}>
        <input type="hidden" name="guia" value={guide.id} />
        <input type="hidden" name="dia" value={l.dia} />
        <Button type="submit" size="sm" variant={done ? "primary" : "outline"} aria-pressed={Boolean(done)}>
          {done ? "Ya lo hice ✓" : "Marcar como hecho"}
        </Button>
      </form>
    </Card>
  );
}

export default async function DirectosPage() {
  const { user } = await requireCreatorAccess();
  const profile = await getLiveProfile(user.id);
  const answers = parseAnswers(profile);
  const week = targetWeek();
  const guideRow = answers && answers.situacion !== "no_quiere" ? await getWeekGuide(user.id, week) : null;
  const guide = guideRow ? parseGuide(guideRow.result) : null;
  const rec = parseRecommendation(profile?.recomendacion);
  const support = answers?.situacion === "no_quiere" ? await listSupport(user.id) : [];
  const sitLabel = SITUATIONS.find((s) => s.id === answers?.situacion)?.label;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow="Publicar" title="Tus directos" />
      <BgStatus userId={user.id} scope={"directos"} />

      {!answers ? (
        <Card data-tour="respuestas">
          <AnswersForm />
        </Card>
      ) : (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              Tu respuesta: <strong>{sitLabel}</strong>
            </p>
            <form action={changeAnswerAction}>
              <Button type="submit" variant="ghost" size="sm">
                Cambiar mi respuesta
              </Button>
            </form>
          </Card>

          {rec && (
            <Card className="flex flex-col gap-2">
              <h2 className="font-extrabold">Nuestra recomendación</h2>
              <p className="text-sm">{rec.texto}</p>
              <ul className="list-disc pl-5 text-sm text-ink-700">
                <li>
                  <strong>App:</strong> {platformLabel(rec.plataforma_sugerida)} — {rec.por_que_esa_app}
                </li>
                <li>
                  <strong>Frecuencia:</strong> {rec.frecuencia_sugerida}
                </li>
                <li>
                  <strong>Duración:</strong> unos {rec.duracion_sugerida_min} minutos
                </li>
              </ul>
            </Card>
          )}

          {answers.situacion !== "no_quiere" && (
            <>
              {guide && guideRow ? (
                <>
                  {guideRow.mock && <p className="rounded-lg bg-naranja-100 p-3 text-xs text-ink-900">Es una guía de ejemplo: con la IA activa usa tu marca y tu voz.</p>}
                  <h2 data-tour="guia" className="text-lg font-extrabold">Directos de la semana del {Number(week.slice(8, 10))}</h2>
                  {guide.lives.map((l) => (
                    <LiveCard key={l.dia} l={l} guide={guideRow} />
                  ))}
                  {guide.comodines.length > 0 && (
                    <Card>
                      <p className="font-extrabold">Comodines si te quedas sin tema</p>
                      <ul className="mt-1 list-disc pl-5 text-sm">
                        {guide.comodines.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </Card>
                  )}
                  <GenerateWeekForm week={week} label="Rehacer la guía de esta semana" />
                </>
              ) : (
                <Card data-tour="guia" className="flex flex-col gap-3">
                  <p className="text-sm text-ink-700">Armamos la guía de tus directos para la semana del {Number(week.slice(8, 10))}: máximo 3 con guion y los demás libres.</p>
                  <GenerateWeekForm week={week} label="Armar la guía de esta semana" />
                </Card>
              )}
            </>
          )}

          {answers.situacion === "no_quiere" && (
            <>
              {showMonthlyNotice(profile) ? (
                <Card className="flex flex-col gap-2">
                  <p className="font-extrabold">¿Te animas a un directo este mes?</p>
                  <p className="text-sm">Los directos son la forma más rápida de que tu comunidad te conozca de verdad. Te damos el tema y las preguntas.</p>
                  <div className="flex flex-wrap gap-2">
                    <SupportForm />
                    <form action={dismissNoticeAction}>
                      <Button type="submit" variant="ghost" size="sm">
                        Ahora no
                      </Button>
                    </form>
                  </div>
                </Card>
              ) : (
                <Card className="flex flex-col gap-2">
                  <SupportForm />
                  <form action={enableNoticeAction}>
                    <Button type="submit" variant="ghost" size="sm">
                      Volver a recibir el aviso mensual
                    </Button>
                  </form>
                </Card>
              )}
              {support.map((g) => {
                const out = parseGuide(g.result);
                return out ? out.lives.map((l) => <LiveCard key={`${g.id}-${l.dia}`} l={l} guide={g} />) : null;
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}
