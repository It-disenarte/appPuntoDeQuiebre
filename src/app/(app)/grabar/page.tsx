import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { EditSection } from "@/components/record/EditSection";
import { PieceJourney, type JourneyStep } from "@/components/record/PieceJourney";
import { requestJoinAction } from "@/lib/recording/actions";
import { getExport } from "@/lib/recording/join";
import { FullVideoSection } from "@/components/record/FullVideoSection";
import { CoachSection } from "@/components/record/CoachSection";
import { RecordingStudio } from "@/components/record/RecordingStudio";
import { VoiceoverSection } from "@/components/record/VoiceoverSection";
import { editQuota, getEdit } from "@/lib/edit/service";
import { Button, ButtonLink, Card, Chip, cn, PageHeader } from "@/components/ui";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { DAY_NAMES, dowMon0 } from "@/lib/plan/rules";
import { getPiece, parseScript } from "@/lib/plan/service";
import { deleteRecordingAction } from "@/lib/recording/actions";
import { PART_LABEL, PARTS, partTexts, type Part } from "@/lib/recording/rules";
import { listRecordings, recordablePieces, recordedCounts } from "@/lib/recording/service";
import type { VideoGuion } from "@/lib/skills/schemas";
import { storageConfigured } from "@/lib/storage";

export const metadata: Metadata = { title: "Grabar" };

const dayLabel = (iso: string) => `${DAY_NAMES[dowMon0(iso)]} ${Number(iso.slice(8, 10))}`;

export default async function GrabarPage({ searchParams }: PageProps<"/grabar">) {
  const { user } = await requireCreatorAccess();
  const params = await searchParams;
  const id = typeof params.pieza === "string" && z.string().uuid().safeParse(params.pieza).success ? params.pieza : null;
  const piece = id ? await getPiece(user.id, id) : null;
  const script = piece?.kind === "video" ? (parseScript("video", piece.script) as VideoGuion | null) : null;

  if (!piece || !script) {
    const pieces = await recordablePieces(user.id);
    const counts = await recordedCounts(user.id, pieces.map((p) => p.id));
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 select-none [-webkit-touch-callout:none]">
        <PageHeader dark eyebrow="Estudio" title="¿Qué vas a grabar?" />
        {pieces.length > 0 && <p className="text-sm text-ink-300">Elige un video. Se graba en 3 partes (gancho, cuerpo y cierre) y la app te guía en cada paso.</p>}
        {pieces.length === 0 ? (
          <Card className="flex flex-col gap-2 bg-ink-800 text-blanco">
            <p className="font-extrabold">Todavía no tienes videos en tu semana</p>
            <p className="text-sm text-ink-300">Genera tu semana y aquí aparecerán tus videos con su guion para grabarlos.</p>
            <Link href="/semana" className="self-start text-sm font-semibold text-azul-100 underline underline-offset-4">
              Ir a mi semana
            </Link>
          </Card>
        ) : (
          <ul data-tour="videos" className="flex flex-col gap-3">
            {pieces.map((p) => {
              const n = counts.get(p.id) ?? 0;
              const full = n >= 3 || p.status === "grabado";
              return (
                <li key={p.id}>
                  <Link href={`/grabar?pieza=${p.id}`} className="flex flex-col gap-3 rounded-card bg-ink-800 p-4 transition hover:bg-ink-700">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-ink-400">{dayLabel(p.day)}</span>
                      <Chip tone={full ? "exito" : n > 0 ? "azul" : "neutral"}>{full ? "Grabado ✓" : n > 0 ? "En proceso" : "Por grabar"}</Chip>
                    </span>
                    <span className="text-lg leading-snug font-extrabold">{p.topic}</span>
                    <span className="flex items-center gap-3">
                      <span className="flex flex-1 gap-1.5" aria-hidden>
                        {PARTS.map((_, i) => (
                          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < n || full ? "bg-exito" : "bg-ink-600")} />
                        ))}
                      </span>
                      <span className="text-xs text-ink-300">{full ? "3 de 3 partes" : `${n} de 3 partes`}</span>
                    </span>
                    <span className="text-sm font-semibold text-naranja">{full ? "Ver mi video →" : n > 0 ? "Seguir grabando →" : "Empezar a grabar →"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // Voz en off: tomas sueltas + una voz grabada aparte (solo Pro; la sección explica el plan si no lo tiene).
  if (params.modo === "vozenoff") {
    const edit = await getEdit(user.id, piece.id);
    const t = partTexts(script);
    const text = [t.gancho, t.cuerpo, t.cierre].filter(Boolean).join("\n\n");
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <PageHeader dark eyebrow={`Voz en off · ${dayLabel(piece.day)}`} title={piece.topic} />
        {edit && edit.mode === "voz_en_off" ? (
          <>
            <EditSection userId={user.id} pieceId={piece.id} mode="vozenoff" />
            <details className="rounded-card bg-ink-800 p-3">
              <summary className="cursor-pointer text-sm font-semibold">Cambiar mis tomas o mi voz</summary>
              <div className="mt-3">
                <VoiceoverSection userId={user.id} pieceId={piece.id} text={text} again />
              </div>
            </details>
          </>
        ) : (
          <VoiceoverSection userId={user.id} pieceId={piece.id} text={text} />
        )}
        <Link href={`/grabar?pieza=${piece.id}`} className="self-start text-sm font-semibold text-azul-100 underline underline-offset-4">
          Prefiero grabarme a cámara
        </Link>
        <Link href={`/semana/${piece.id}`} className="self-start text-sm font-semibold text-azul-100 underline underline-offset-4">
          Ver el guion completo
        </Link>
      </div>
    );
  }

  const [recs, exp, edit, quota] = await Promise.all([listRecordings(user.id, piece.id), getExport(user.id, piece.id), getEdit(user.id, piece.id), editQuota(user.id)]);
  const done = recs.map((r) => ({ part: r.part as Part, id: r.id, seconds: r.seconds }));
  const allParts = done.length === 3;
  const joined = exp?.status === "lista";
  const joining = exp?.status === "procesando";
  const edited = edit?.status === "lista";
  const pro = quota.allowed;
  const missing = PARTS.filter((p) => !done.some((d) => d.part === p)).map((p) => PART_LABEL[p]);
  const steps: JourneyStep[] = [
    { id: "grabar", label: "Grabar", href: "#grabar", state: allParts ? "done" : "current" },
    { id: "video", label: "Unir", href: "#video", state: joined ? "done" : allParts ? "current" : "todo" },
    { id: "edicion", label: pro ? "Editar" : "Editar · Pro", href: "#edicion", state: edited ? "done" : joined && pro ? "current" : "todo" },
    { id: "publicar", label: "Publicar", href: `/semana/${piece.id}`, state: edited || (joined && !pro) ? "current" : "todo" },
  ];

  // “Ahora toca”: una sola cosa clara por vez.
  const next = !allParts
    ? { title: `Te falta${missing.length > 1 ? "n" : ""} ${missing.join(", ")}`, text: "Graba cada parte con tu cámara y el teleprompter flotante.", cta: <ButtonLink href="#grabar" variant="accent">Ir a grabar</ButtonLink> }
    : joining
      ? { title: "Armando tu video…", text: "Une tus 3 partes en un solo video vertical. Tarda un par de minutos y te avisamos.", cta: null }
      : !joined
        ? {
            title: "Arma tu video completo",
            text: "Ya tienes las 3 partes. Las unimos en un solo video vertical listo para subir.",
            cta: (
              <form action={requestJoinAction}>
                <input type="hidden" name="pieza" value={piece.id} />
                <Button type="submit" variant="accent">
                  Armar mi video completo
                </Button>
              </form>
            ),
          }
        : pro && !edited
          ? { title: "Ahora edítalo con IA", text: "Quitamos silencios y muletillas, ponemos subtítulos con tu estilo y una portada. Tú revisas antes.", cta: <ButtonLink href="#edicion" variant="accent">Editar mi video</ButtonLink> }
          : {
              title: edited ? "¡Tu video editado está listo!" : "¡Tu video está listo!",
              text: "Descárgalo y pasa a escribir los textos de publicación.",
              cta: (
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={`/semana/${piece.id}`} variant="accent">
                    Seguir a mis textos
                  </ButtonLink>
                  <a href={edited ? `/api/grabaciones/editado/${piece.id}?descargar=1` : `/api/grabaciones/video/${piece.id}?descargar=1`} className="tap inline-flex h-11 items-center rounded-full border border-ink-600 px-5 text-[0.9375rem] font-semibold">
                    Descargar video
                  </a>
                </div>
              ),
            };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link href="/grabar" className="self-start text-sm font-semibold text-azul-100 underline underline-offset-4">
        ← Mis videos
      </Link>
      <PageHeader dark eyebrow={`Video · ${dayLabel(piece.day)}`} title={piece.topic} />
      <PieceJourney steps={steps} />

      <section className="flex flex-col gap-2 rounded-card bg-azul p-4" aria-label="Lo que toca ahora">
        <p className="text-xs font-bold tracking-wide text-azul-100 uppercase">Ahora toca</p>
        <h2 className="font-display text-3xl text-blanco">{next.title}</h2>
        <p className="text-sm text-azul-100">{next.text}</p>
        {next.cta && <div className="mt-1">{next.cta}</div>}
      </section>

      {!storageConfigured() ? (
        <Card className="bg-ink-800 text-blanco">
          <p className="text-sm">El almacenamiento de videos todavía no está configurado, así que no se pueden subir grabaciones.</p>
        </Card>
      ) : (
        <div id="grabar" data-tour="estudio" className="scroll-mt-4">
          <RecordingStudio pieceId={piece.id} texts={partTexts(script)} done={done} />
        </div>
      )}

      {recs.length > 0 && (
        <section id="partes" data-tour="partes" className="flex flex-col gap-2 scroll-mt-4" aria-label="Partes subidas">
          <h2 className="font-extrabold">Tus partes</h2>
          {PARTS.map((p) => recs.find((r) => r.part === p))
            .filter((r): r is NonNullable<typeof r> => Boolean(r))
            .map((r) => (
              <details key={r.id} className="rounded-card bg-ink-800 p-3">
                <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
                  <span>
                    <span className="mr-2 text-exito">✓</span>
                    {PART_LABEL[r.part as Part]} · {r.seconds} s
                  </span>
                  <span className="text-xs font-normal text-ink-300">Ver</span>
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                  {r.purgedAt ? <p className="text-xs text-ink-300">Este archivo se borró por antigüedad (se conservan 30 días).</p> : <video src={`/api/grabaciones/${r.id}`} controls playsInline preload="metadata" className="max-h-80 w-full rounded-lg bg-negro" />}
                  <form action={deleteRecordingAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="tap rounded-full px-3 text-xs font-semibold text-ink-300 underline underline-offset-4">
                      Borrar esta parte
                    </button>
                  </form>
                </div>
              </details>
            ))}
        </section>
      )}

      {allParts && <FullVideoSection userId={user.id} pieceId={piece.id} />}
      {allParts && <EditSection userId={user.id} pieceId={piece.id} mode={typeof params.modo === "string" ? params.modo : undefined} />}
      {allParts && (
        <details className="rounded-card bg-ink-800 p-4">
          <summary className="cursor-pointer font-extrabold">El Lente · revisión opcional de tu video</summary>
          <div className="mt-3">
            <CoachSection userId={user.id} pieceId={piece.id} />
          </div>
        </details>
      )}

      <div className="flex flex-col gap-2 border-t border-ink-800 pt-4">
        {!allParts && (
          <Link href={`/grabar?pieza=${piece.id}&modo=vozenoff`} className="self-start text-sm font-semibold text-azul-100 underline underline-offset-4">
            ¿Tu video es voz en off con tomas? Hazlo aquí
          </Link>
        )}
        <Link href={`/semana/${piece.id}`} className="self-start text-sm font-semibold text-azul-100 underline underline-offset-4">
          Ver el guion completo
        </Link>
      </div>
    </div>
  );
}
