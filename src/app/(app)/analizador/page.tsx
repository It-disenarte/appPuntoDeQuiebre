import { Star, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { AddCompetitorForm, StartRunForm } from "@/components/analyzer/Forms";
import { BankVideoButton, IdeaActions } from "@/components/analyzer/IdeaActions";
import { removeIdeaAction } from "@/lib/ideas/actions";
import { listIdeas } from "@/lib/ideas/bank";
import Link from "next/link";
import { Poller } from "@/components/metrics/Poller";
import { Button, Card, Chip, PageHeader } from "@/components/ui";
import { removeCompetitorAction, toggleStarAction } from "@/lib/analyzer/actions";
import { getLimits } from "@/lib/admin/limits";
import { latestDoneRun, latestRun, listCompetitors, listVideos, nextAllowedAt, parseAnalysis, parseConcepts, parseProgress } from "@/lib/analyzer/service";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { formatCount } from "@/lib/metrics/schemas";
import { isAdminUser, showFor } from "@/lib/shown-error";

export const metadata: Metadata = { title: "Analizador de competencia" };

const dateEs = (d: Date) => d.toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" });

export default async function AnalizadorPage() {
  const { user } = await requireCreatorAccess();
  const [comps, run, wait, done, bank] = await Promise.all([listCompetitors(user.id), latestRun(user.id), nextAllowedAt(user.id), latestDoneRun(user.id), listIdeas(user.id)]);
  const admin = await isAdminUser(user.id);
  const savedIdeas = bank.filter((i) => i.status === "guardada");
  const asVideo = bank.filter((i) => i.pieceId).slice(0, 5);
  const savedTitles = new Set(bank.map((i) => i.title));
  const intervalDays = (await getLimits()).analyzerIntervalDays;
  const running = run && ["en_cola", "corriendo"].includes(run.status);
  // Se muestran los resultados del último análisis que terminó bien, aunque el intento más reciente haya fallado.
  const lastDone = done;
  const videos = await listVideos(user.id, lastDone?.id);
  const progress = run ? parseProgress(run.progress) : null;
  const pct = progress && progress.videosTotal > 0 ? Math.round((progress.videosDone / progress.videosTotal) * 100) : progress ? Math.round((progress.accountsDone / Math.max(1, progress.accountsTotal)) * 40) : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {running && <Poller />}
      <PageHeader eyebrow="Inspiración" title="Analizador de competencia" />
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-ink-700">Elige las cuentas que admiras. Buscamos sus reels más vistos del último mes, los desarmamos (gancho, retención y recompensa) y te proponemos <strong>ideas nuevas con tu voz</strong>. No copiamos nada: tomamos la estructura.</p>
        <p className="text-xs text-ink-500">Puedes correrlo una vez cada {intervalDays} días.</p>
      </Card>

      <Card data-tour="competidores" className="flex flex-col gap-3">
        <p className="font-extrabold">Cuentas que estudiamos ({comps.length})</p>
        <ul className="flex flex-col divide-y divide-ink-100">
          {comps.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="font-semibold">@{c.username}</p>
                <p className="text-xs text-ink-500">
                  {c.source === "referente" ? "De tus referentes" : "Agregada por ti"}
                  {c.avgViews30d != null ? ` · promedio ${formatCount(c.avgViews30d)} vistas por reel` : ""}
                </p>
              </div>
              <form action={removeCompetitorAction}>
                <input type="hidden" name="id" value={c.id} />
                <Button type="submit" variant="ghost" size="sm" aria-label={`Quitar a @${c.username}`}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </form>
            </li>
          ))}
          {comps.length === 0 && <li className="py-2 text-sm text-ink-600">Todavía no hay cuentas. Agrega la primera.</li>}
        </ul>
        <AddCompetitorForm />
      </Card>

      {(savedIdeas.length > 0 || asVideo.length > 0) && (
        <Card className="flex flex-col gap-3">
          <p className="font-extrabold">Mi banco de ideas ({savedIdeas.length})</p>
          {savedIdeas.length > 0 && <p className="text-xs text-ink-500">Cuando armes tu próxima semana tomo hasta 3 de estas ideas (las más antiguas) como base de tus guiones. O conviértelas en video ahora mismo.</p>}
          <ul className="flex flex-col divide-y divide-ink-100">
            {savedIdeas.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 py-3">
                <div>
                  <p className="font-semibold">{i.title}</p>
                  {i.hook && <p className="text-sm text-ink-700">“{i.hook}”</p>}
                  {i.creator && <p className="text-xs text-ink-500">Inspirada en @{i.creator}</p>}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <BankVideoButton ideaId={i.id} />
                  <form action={removeIdeaAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Quitar
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          {asVideo.length > 0 && (
            <div className="text-xs text-ink-600">
              <p className="font-semibold">Ya son video en tu semana:</p>
              <ul className="list-disc pl-5">
                {asVideo.map((i) => (
                  <li key={i.id}>
                    <Link href={`/semana/${i.pieceId}`} className="font-semibold text-azul underline underline-offset-4">
                      {i.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {running && progress ? (
        <Card className="flex flex-col gap-2" aria-live="polite">
          <p className="font-extrabold">{progress.phase === "analizando" ? "Analizando los videos…" : "Buscando los reels más vistos…"}</p>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-azul transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-ink-600">
            Cuentas {progress.accountsDone}/{progress.accountsTotal}
            {progress.videosTotal > 0 ? ` · videos ${progress.videosDone}/${progress.videosTotal}` : ""}. Puedes salir: te avisamos al terminar.
          </p>
        </Card>
      ) : (
        <Card data-tour="correr" className="flex flex-col gap-3">
          {run?.status === "error" && (
            <div role="alert" className="flex flex-col gap-1 text-sm text-alerta">
              <p>El último intento falló: {showFor(admin, run.error, "algo salió mal")} No cuenta para tu límite semanal.</p>
              {parseProgress(run.progress).errors.length > 1 && (
                <ul className="list-disc pl-5 text-xs">
                  {parseProgress(run.progress)
                    .errors.slice(0, 4)
                    .map((e, i) => (
                      <li key={i}>{showFor(admin, e)}</li>
                    ))}
                </ul>
              )}
            </div>
          )}
          {wait ? (
            <p className="text-sm text-ink-700">
              Ya hiciste tu análisis de esta semana{lastDone ? " (sus resultados están aquí abajo)" : ""}. Podrás correr otro el <strong>{dateEs(wait)}</strong>.
            </p>
          ) : (
            <StartRunForm disabled={comps.length === 0} />
          )}
        </Card>
      )}

      {lastDone && (
        <section data-tour="resultados" className="flex flex-col gap-3" aria-label="Resultados">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold">Lo que encontramos</h2>
            {lastDone.mock && <Chip>Ejemplo</Chip>}
          </div>
          {lastDone.mock && <p className="rounded-lg bg-naranja-100 p-3 text-xs text-ink-900">Son videos de ejemplo: el análisis real todavía no está activado en esta cuenta.</p>}
          {videos.map((v) => {
            const a = parseAnalysis(v.analysis);
            const c = parseConcepts(v.concepts);
            return (
              <Card key={v.id} className="flex flex-col gap-3">
                <div className="flex gap-3">
                  {v.thumbnailKey && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/analizador/miniatura/${v.id}`} alt="" width={72} height={96} className="h-24 w-[72px] shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold">@{v.creator}</p>
                    <p className="text-xs text-ink-600">
                      {formatCount(v.views)} vistas · {formatCount(v.likes)} me gusta · {formatCount(v.comments)} comentarios
                    </p>
                    {!lastDone.mock && (
                      <a href={v.link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-azul underline underline-offset-4">
                        Ver el reel original
                      </a>
                    )}
                  </div>
                  <form action={toggleStarAction}>
                    <input type="hidden" name="id" value={v.id} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={v.starred ? "Quitar de favoritos" : "Guardar en favoritos"} aria-pressed={v.starred}>
                      <Star className={v.starred ? "size-5 fill-naranja text-naranja" : "size-5"} aria-hidden />
                    </Button>
                  </form>
                </div>
                {a && (
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-azul">Por qué funcionó</summary>
                    <div className="mt-2 flex flex-col gap-2 text-sm text-ink-800">
                      <p>{a.concepto}</p>
                      <p>
                        <strong>Gancho:</strong> {a.gancho.audio || a.gancho.texto || a.gancho.visual} — {a.gancho.por_que_funciona}
                      </p>
                      {a.retencion.length > 0 && (
                        <ul className="list-disc pl-5">
                          {a.retencion.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      )}
                      <p>
                        <strong>Recompensa:</strong> {a.recompensa.descripcion}
                      </p>
                    </div>
                  </details>
                )}
                {c && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-extrabold">Ideas nuevas para ti</p>
                    {c.conceptos.map((x, i) => (
                      <div key={i} className="rounded-lg bg-ink-50 p-3 text-sm">
                        <p className="font-semibold">{x.titulo}</p>
                        <p className="text-ink-700">“{x.gancho}”</p>
                        <p className="mt-1 text-ink-700">{x.idea}</p>
                        {x.guion_corto && <p className="mt-1 text-xs text-ink-600">{x.guion_corto}</p>}
                        <IdeaActions idea={{ titulo: x.titulo, gancho: x.gancho, idea: x.idea, guion: x.guion_corto ?? null, creador: v.creator }} saved={savedTitles.has(x.titulo.trim().slice(0, 140))} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
          {progress && progress.errors.length > 0 && (
            <details className="text-xs text-ink-600">
              <summary className="cursor-pointer">Avisos de la búsqueda ({progress.errors.length})</summary>
              <ul className="mt-1 list-disc pl-5">
                {progress.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
