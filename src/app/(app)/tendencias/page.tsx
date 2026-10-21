import type { Metadata } from "next";
import { ChooseForm, RefreshForm, RequestForm } from "@/components/trends/TrendForms";
import { Button, Card, Chip, PageHeader } from "@/components/ui";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { MAX_REFRESH } from "@/lib/trends/schemas";
import { useTrendAction } from "@/lib/trends/actions";
import { currentList, listUses, parseRounds, selectableTrends, weeklyQuota } from "@/lib/trends/service";
import { BgStatus } from "@/components/BgStatus";

export const metadata: Metadata = { title: "Tendencias" };

const dateEs = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });

export default async function TendenciasPage() {
  const { user } = await requireCreatorAccess();
  const [quota, uses, list, selectable] = await Promise.all([weeklyQuota(user.id), listUses(user.id), currentList(), selectableTrends(user.id)]);
  const left = Math.max(0, quota.limit - quota.used);
  const latest = uses[0];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow="Inspiración" title="Tendencias" />
      <BgStatus userId={user.id} scope={"tendencias"} />
      <Card data-tour="pedir" className="flex flex-col gap-3">
        <p className="text-sm text-ink-700">Tomamos lo que está de moda en TikTok México y lo convertimos en <strong>ideas listas para grabar con tu marca</strong>, con la fecha límite para que entren a tiempo.</p>
        <p className="rounded-lg bg-naranja-100 p-3 text-sm text-ink-900">Las tendencias duran pocos días. Úsalo cuando puedas grabar en las próximas 48 horas.</p>
        <p className="text-xs text-ink-500">
          Te quedan {left} de {quota.limit} consultas esta semana (se renuevan el {dateEs(quota.renews)}). Lista del {dateEs(list.day)}
          {list.source === "muestra" ? " · de ejemplo: aún no hay conexión con TikTok" : ""}.
        </p>
        <RequestForm disabled={left === 0} />
      </Card>

      {latest &&
        (() => {
          const rounds = parseRounds(latest.rounds);
          return (
            <section data-tour="ideas" className="flex flex-col gap-3" aria-label="Tus ideas">
              {latest.mock && <p className="rounded-lg bg-naranja-100 p-3 text-xs text-ink-900">Son ideas de ejemplo: con la IA y una lista real usan tu marca y las tendencias de hoy.</p>}
              {rounds.map((r, ri) => (
                <div key={ri} className="flex flex-col gap-3">
                  {r.note && <p className="text-xs text-ink-500">{r.note.startsWith("Elegida") ? r.note : `Otras ideas según tu nota: “${r.note}”`}</p>}
                  {r.aviso && <p className="text-sm text-ink-600">{r.aviso}</p>}
                  {r.ideas.map((i) => (
                    <Card key={`${ri}-${i.tendencia_id}`} className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone={i.urgencia.estado === "pico" ? "alerta" : "naranja"}>{i.urgencia.estado === "pico" ? "En su pico" : "Subiendo"}</Chip>
                        <Chip tone="azul">{i.formato}</Chip>
                        {i.pilar && <Chip>{i.pilar}</Chip>}
                      </div>
                      <h2 className="text-lg font-extrabold">{i.idea}</h2>
                      <p className="text-xs text-ink-500">Tendencia: {i.tendencia_nombre}</p>
                      <p className="text-sm font-semibold">
                        ⏰ {i.urgencia.texto} {i.urgencia.grabar_antes_de && <span className="font-normal">(antes del {dateEs(i.urgencia.grabar_antes_de)})</span>}
                      </p>
                      {i.cuando_grabar && <p className="text-sm">📅 {i.cuando_grabar}</p>}
                      {i.por_que_te_sirve && <p className="text-sm text-ink-700">{i.por_que_te_sirve}</p>}
                      <p className="text-sm">
                        <strong>Gancho:</strong> “{i.gancho}”
                      </p>
                      {i.guion.length > 0 && (
                        <ol className="list-decimal pl-5 text-sm">
                          {i.guion.map((g, k) => (
                            <li key={k}>{g}</li>
                          ))}
                        </ol>
                      )}
                      {i.como_grabarla && <p className="text-sm text-ink-700">🎥 {i.como_grabarla}</p>}
                      {(i.audio.nombre || i.audio.nota) && (
                        <p className="text-sm">
                          🎵 {i.audio.nombre} {i.audio.nota && <span className="text-ink-600">— {i.audio.nota}</span>}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        {i.video_ejemplo && (
                          <a href={i.video_ejemplo} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-azul underline underline-offset-4">
                            Ver video de ejemplo
                          </a>
                        )}
                        {i.audio.link && (
                          <a href={i.audio.link} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-azul underline underline-offset-4">
                            Escuchar el audio
                          </a>
                        )}
                        <form action={useTrendAction}>
                          <input type="hidden" name="tendencia" value={i.tendencia_id} />
                          <input type="hidden" name="paso" value={i.siguiente_paso} />
                          <Button type="submit" size="sm">
                            Voy a usar esta
                          </Button>
                        </form>
                      </div>
                    </Card>
                  ))}
                </div>
              ))}
              {latest.refreshes < MAX_REFRESH ? (
                <RefreshForm useId={latest.id} />
              ) : (
                <ChooseForm useId={latest.id} options={Object.fromEntries(selectable.map((t) => [t.id, t.nombre]))} />
              )}
            </section>
          );
        })()}
    </div>
  );
}
