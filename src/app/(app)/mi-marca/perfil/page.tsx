import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HighlightCovers } from "@/components/profile/HighlightCovers";
import { CurrentForm, OptionPicker, PhotoUploader } from "@/components/profile/ProfileForms";
import { Button, Card, Chip, PageHeader } from "@/components/ui";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { getKit } from "@/lib/kit/service";
import { removePhotoAction, toggleAppliedAction, votePartAction } from "@/lib/profile/actions";
import { BIO_MAX, cropStyle, MAX_PHOTOS, MAX_REFRESH, NAME_MAX, RUBRIC, type ProfilePart } from "@/lib/profile/schemas";
import { getProfile, parseApplied, parseChosen, parseCurrent, parseExtra, parsePhotos, parseResult, parseVotes, winner } from "@/lib/profile/service";
import { BgStatus } from "@/components/BgStatus";

export const metadata: Metadata = { title: "Optimiza tu perfil" };

const STATE_TONE = { bien: "exito", mejorar: "naranja", falta: "alerta" } as const;
const STATE_TEXT = { bien: "Va bien", mejorar: "Mejorar", falta: "Falta" } as const;

function Applied({ part, done }: { part: ProfilePart; done: boolean }) {
  return (
    <form action={toggleAppliedAction}>
      <input type="hidden" name="parte" value={part} />
      <Button type="submit" size="sm" variant={done ? "primary" : "outline"} aria-pressed={done}>
        {done ? <Check className="size-4" aria-hidden /> : null} {done ? "Ya lo apliqué" : "Marcar como aplicado"}
      </Button>
    </form>
  );
}

function Votes({ part, vote }: { part: ProfilePart; vote?: string }) {
  return (
    <form action={votePartAction} className="flex items-center gap-2">
      <input type="hidden" name="parte" value={part} />
      <Button type="submit" name="voto" value="si" size="sm" variant={vote === "si" ? "primary" : "ghost"} aria-label="Me sirve" aria-pressed={vote === "si"}>
        👍
      </Button>
      <Button type="submit" name="voto" value="no" size="sm" variant={vote === "no" ? "primary" : "ghost"} aria-label="No me sirve" aria-pressed={vote === "no"}>
        👎
      </Button>
    </form>
  );
}

export default async function PerfilPage() {
  const { user } = await requireCreatorAccess();
  const row = await getProfile(user.id);
  const current = row && parseCurrent(row.current);
  const result = row && parseResult(row.result);
  const extra = row ? parseExtra(row.extra) : {};
  const chosen = row ? parseChosen(row.chosen) : {};
  const votes = row ? parseVotes(row.votes) : {};
  const applied = row ? parseApplied(row.applied) : {};
  const photos = row ? parsePhotos(row.photos) : [];
  const refreshes = (row?.refreshes ?? {}) as Record<string, number>;
  const kit = await getKit(user.id).catch(() => null);
  const ring = kit?.final?.colores.acento ?? "#FE6807";
  const best = winner(photos);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow="Mi marca" title="Optimiza tu perfil" />
      <BgStatus userId={user.id} scope={"perfil"} />
      <p className="text-ink-700">Tu perfil debe decir en 3 segundos <strong>quién eres, a quién ayudas y por qué seguirte</strong>. Te damos propuestas para copiar y pegar: nosotros no tocamos tu cuenta.</p>
      {row?.mock && result && <p className="rounded-lg bg-naranja-100 p-3 text-xs text-ink-900">Son propuestas de ejemplo: con la IA activa se escriben con tu voz y tu marca.</p>}

      <Card>
        {result ? (
          <details>
            <summary className="cursor-pointer font-extrabold">Tu perfil hoy (editar)</summary>
            <div className="mt-4">
              <CurrentForm current={current ?? null} hasResult />
            </div>
          </details>
        ) : (
          <div className="flex flex-col gap-3">
            <h2 className="font-extrabold">Tu perfil hoy</h2>
            <CurrentForm current={current ?? null} hasResult={false} />
          </div>
        )}
      </Card>

      {result && (
        <>
          <Card className="flex flex-col gap-3">
            <h2 className="font-extrabold">Cómo está tu perfil</h2>
            <ul className="flex flex-col gap-2">
              {result.diagnostico.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Chip tone={STATE_TONE[d.estado]}>{STATE_TEXT[d.estado]}</Chip>
                  <span>
                    <strong className="capitalize">{d.parte}:</strong> {d.por_que}
                  </span>
                </li>
              ))}
            </ul>
            {result.orden_de_cambios.length > 0 && (
              <p className="text-xs text-ink-600">
                <strong>Orden sugerido:</strong> {result.orden_de_cambios.join(" → ")}
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-extrabold">Nombre</h2>
              <Applied part="nombre" done={Boolean(applied.nombre)} />
            </div>
            <p className="text-xs text-ink-500">El nombre se busca en Instagram: lleva la palabra que la gente teclea para encontrarte{result.nombre.palabra_clave ? ` (“${result.nombre.palabra_clave}”)` : ""}.</p>
            <OptionPicker part="nombre" rounds={[{ options: result.nombre.opciones, note: null }, ...(extra.nombre ?? [])]} chosen={chosen.nombre ?? ""} canRefresh={(refreshes.nombre ?? 0) < MAX_REFRESH} max={NAME_MAX} />
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-extrabold">Biografía</h2>
              <Applied part="biografia" done={Boolean(applied.biografia)} />
            </div>
            <p className="text-xs text-ink-500">Máximo {BIO_MAX} caracteres: qué haces, para quién y una invitación.</p>
            <OptionPicker part="biografia" rounds={[{ options: result.biografia.opciones.map((b) => b.texto), note: null }, ...(extra.biografia ?? [])]} chosen={chosen.biografia ?? ""} canRefresh={(refreshes.biografia ?? 0) < MAX_REFRESH} max={BIO_MAX} />
          </Card>

          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-extrabold">Enlace</h2>
              <Applied part="enlace" done={Boolean(applied.enlace)} />
            </div>
            <p className="text-sm">{result.enlace.recomendacion}</p>
            <p className="text-xs text-ink-500">{result.enlace.por_que}</p>
            <Votes part="enlace" vote={votes.enlace?.voto} />
          </Card>

          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-extrabold">Categoría</h2>
              <Applied part="categoria" done={Boolean(applied.categoria)} />
            </div>
            <p className="text-sm">{result.categoria}</p>
            <Votes part="categoria" vote={votes.categoria?.voto} />
          </Card>

          {result.destacadas.length > 0 && (
            <Card className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-extrabold">Destacadas</h2>
                <Applied part="destacadas" done={Boolean(applied.destacadas)} />
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {result.destacadas.map((d, i) => (
                  <li key={i}>
                    <strong>{d.nombre}</strong> <Chip tone={d.accion === "mantener" ? "neutral" : "azul"}>{d.accion}</Chip> <span className="text-ink-600">{d.que_lleva}</span>
                  </li>
                ))}
              </ul>
              <HighlightCovers items={result.destacadas} ring={ring} />
              <Votes part="destacadas" vote={votes.destacadas?.voto} />
            </Card>
          )}
        </>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="font-extrabold">Tu foto de perfil</h2>
        <p className="text-sm text-ink-700">La calificamos del 1 al 10 en el tamaño real en que se ve (perfil, feed y comentarios) y te damos consejos que puedes hacer con tu celular. Nunca generamos ni editamos tu foto.</p>
        <PhotoUploader count={photos.length} max={MAX_PHOTOS} />
        {photos
          .map((p, i) => ({ p, i }))
          .reverse()
          .map(({ p, i }) => {
            const prev = photos[i - 1];
            const crop = cropStyle(p.result.recorte_sugerido);
            return (
              <div key={p.key} className="flex flex-col gap-3 rounded-xl border border-ink-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-3xl">{p.result.calificacion}/10</span>
                  {best === i && <Chip tone="exito">Tu mejor foto</Chip>}
                  {prev && prev.result.calificacion !== p.result.calificacion && <Chip tone={p.result.calificacion > prev.result.calificacion ? "exito" : "naranja"}>Antes {prev.result.calificacion} → ahora {p.result.calificacion}</Chip>}
                  {p.mock && <Chip tone="naranja">Ejemplo</Chip>}
                </div>
                <div className="flex items-end gap-4">
                  {[200, 60, 32].map((s) => (
                    <div key={s} className="flex flex-col items-center gap-1">
                      <div className="overflow-hidden rounded-full bg-ink-100" style={{ width: s * 0.6, height: s * 0.6 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/perfil/foto/${i}`} alt="" className="size-full object-cover" style={crop} />
                      </div>
                      <span className="text-[0.625rem] text-ink-500">{s === 200 ? "Perfil" : s === 60 ? "Feed" : "Comentarios"}</span>
                    </div>
                  ))}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/perfil/foto/${i}`} alt="Tu foto sin recorte" className="size-24 rounded-lg object-cover" />
                </div>
                <p className="text-sm">
                  <strong>Lo que funciona:</strong> {p.result.lo_que_funciona}
                </p>
                <ul className="list-disc pl-5 text-sm text-ink-700">
                  {p.result.consejos.map((c, k) => (
                    <li key={k}>{c}</li>
                  ))}
                </ul>
                <details className="text-xs text-ink-600">
                  <summary className="cursor-pointer font-semibold">Ver calificación por criterio</summary>
                  <ul className="mt-1">
                    {RUBRIC.map((r) => (
                      <li key={r.id}>
                        {r.label}: {(p.result.rubrica as Record<string, number>)[r.id] ?? 0}/{r.max}
                      </li>
                    ))}
                  </ul>
                </details>
                <form action={removePhotoAction}>
                  <input type="hidden" name="key" value={p.key} />
                  <Button type="submit" variant="ghost" size="sm">
                    Quitar esta foto
                  </Button>
                </form>
              </div>
            );
          })}
      </Card>

      <Link href="/mi-marca" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
        Volver a Mi marca
      </Link>
    </div>
  );
}
