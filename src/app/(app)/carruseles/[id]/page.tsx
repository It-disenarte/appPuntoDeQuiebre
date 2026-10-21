import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ExportButtons } from "@/components/carousel/ExportButtons";
import { GenerateAllImages } from "@/components/carousel/GenerateImages";
import { imageQuota } from "@/lib/carousel/ai-images";
import { SlideEditor } from "@/components/carousel/SlideEditor";
import { IdeasStep, InterviewStep } from "@/components/carousel/Steps";
import { RegenerateForm } from "@/components/carousel/RegenerateForm";
import { Button, Card, Chip, PageHeader } from "@/components/ui";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { deleteCarouselAction, setBackgroundAction } from "@/lib/carousel/actions";
import { canvasBgOf, canvasKitOf } from "@/lib/carousel/kit";
import { GeneratingCard } from "@/components/brujula/GeneratingCard";
import { Poller } from "@/components/metrics/Poller";
import { latestCarouselJob, OP_LABEL, previousAnswers, attemptsLeft, type CarouselRow, getCarousel, imageWarnings, parseBrief, parseContent, parseIdeaRounds, parseImages, parseInterview, stepOf } from "@/lib/carousel/service";
import { MAX_FULL_REDO, MAX_IDEA_REFRESH, type CarruselOut, type Idea } from "@/lib/carousel/schemas";
import { getKit } from "@/lib/kit/service";

export const metadata: Metadata = { title: "Carrusel" };

export default async function CarruselPage({ params }: PageProps<"/carruseles/[id]">) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { user } = await requireCreatorAccess();
  const row = await getCarousel(user.id, id);
  const brief = row && parseBrief(row.brief);
  if (!row || !brief) notFound();
  const step = stepOf(row);
  const content = parseContent(row.content);
  const chosen = row.chosen as Idea | null;
  const previous = step === "entrevista" ? await previousAnswers(user.id, id) : null;
  const job = await latestCarouselJob(user.id, id);
  const busy = Boolean(job?.active);
  // Un intento fallido solo se avisa si es posterior a lo último que cambió en el carrusel.
  const failed = Boolean(job && job.recent && job.status === "error" && job.createdAt > row.updatedAt);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader eyebrow={`Carrusel ${row.number}`} title={content?.titulo ?? chosen?.titulo ?? brief.tema} />
      <div className="flex flex-wrap items-center gap-2">
        {row.mock && <Chip tone="naranja">Versión de ejemplo</Chip>}
        <Link href="/carruseles" className="text-sm font-semibold text-azul underline underline-offset-4">
          Mis carruseles
        </Link>
      </div>
      {row.mock && <p className="rounded-lg bg-naranja-100 p-3 text-xs text-ink-900">Esto es una prueba sin IA: los textos son de ejemplo. Con la IA activa se escriben con tu voz y tu marca.</p>}

      {busy && job && (
        <>
          <Poller everyMs={3000} />
          <GeneratingCard since={job.createdAt.getTime()} title={OP_LABEL[job.op].title} text={OP_LABEL[job.op].text} />
        </>
      )}
      {failed && job && (
        <p role="alert" className="rounded-xl bg-alerta-100 p-4 text-sm font-semibold text-alerta">
          No pudimos completar este paso: {job.error ?? "algo falló"}. Inténtalo de nuevo.
        </p>
      )}

      {!busy && step === "ideas" && parseIdeaRounds(row.ideas).length === 0 && !failed && <p className="text-sm text-ink-600">Todavía no hay ideas para este carrusel.</p>}

      {!busy && step === "ideas" && parseIdeaRounds(row.ideas).length > 0 && (
        <>
          <h2 className="text-lg font-extrabold">Elige una idea</h2>
          <IdeasStep
            id={id}
            rounds={parseIdeaRounds(row.ideas).map((r) => ({ items: r.items, note: r.note }))}
            canRefresh={parseIdeaRounds(row.ideas).length <= MAX_IDEA_REFRESH}
            recommended={{ tipo: parseIdeaRounds(row.ideas)[0]?.tipo_recomendado ?? null, porque: parseIdeaRounds(row.ideas)[0]?.porque_tipo ?? null }}
          />
        </>
      )}

      {!busy && step === "entrevista" && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold">Cuéntanos cómo se verán tus imágenes</h2>
          {(() => {
            const iv = parseInterview(row.interview);
            return iv ? <InterviewStep id={id} interview={iv} previous={previous} /> : <p className="text-sm text-alerta">No pudimos cargar las preguntas. Vuelve a elegir tu idea.</p>;
          })()}
        </Card>
      )}

      {!busy && step === "carrusel" && content && <CarouselEditor userId={user.id} id={id} row={row} content={content} />}

      <form action={deleteCarouselAction} className="self-start">
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="ghost" size="sm">
          Borrar este carrusel
        </Button>
      </form>
    </div>
  );

}

async function CarouselEditor({ userId, id, row, content }: { userId: string; id: string; row: CarouselRow; content: CarruselOut }) {
  const kitData = await getKit(userId);
  const quota = await imageQuota(userId);
  const kit = canvasKitOf(kitData.final);
  const bg = canvasBgOf(content, row.background, kit);
  const images = parseImages(row.images);
  const handle = undefined as string | undefined;
  const slideProps = content.slides.map((s) => {
    const img = images[String(s.n)];
    return { slide: s, kit, bg, imageUrl: img ? `/api/carruseles/${id}/imagen/${s.n}?v=${encodeURIComponent(img.key.slice(-12))}` : null, focal: img ? { x: img.focalX, y: img.focalY } : undefined, total: content.slides.length, handle };
  });
  const warnings = imageWarnings(content);
  const missing = content.slides.filter((s) => s.imagen.fuente !== "ninguna" && !images[String(s.n)]).length;
  const missingAi = content.slides.filter((s) => s.imagen.fuente === "ia" && s.imagen.prompt_ia && !images[String(s.n)]).length;

  return (
    <>
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-ink-700">{content.estructura_porque}</p>
        {content.estilo_detectado && (
          <p className="text-xs text-ink-600">
            <strong>Estilo que entendimos:</strong> {content.estilo_detectado}
          </p>
        )}
        {content.mensaje_al_creador && <p className="text-sm font-semibold">{content.mensaje_al_creador}</p>}
        {warnings.map((w) => (
          <p key={w} className="text-xs text-alerta">
            {w}
          </p>
        ))}
        {content.instrucciones_ia.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-azul">Cómo crear las imágenes con IA</summary>
            <ol className="mt-2 list-decimal pl-5 text-sm text-ink-700">
              {content.instrucciones_ia.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
            {content.bloque_estilo_ia && <p className="mt-2 text-xs text-ink-600">Estilo común de todas: {content.bloque_estilo_ia}</p>}
          </details>
        )}
      </Card>

      {content.fondo_slides_texto && content.fondo_slides_texto.opciones.length > 0 && (
        <Card className="flex flex-col gap-2">
          <p className="text-sm font-extrabold">Fondo de los slides de texto</p>
          <p className="text-xs text-ink-500">{content.fondo_slides_texto.porque}</p>
          <div className="flex flex-wrap gap-2">
            {content.fondo_slides_texto.opciones.map((o) => {
              const on = (row.background ?? content.fondo_slides_texto?.recomendado) === o.id;
              return (
                <form key={o.id} action={setBackgroundAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="fondo" value={o.id} />
                  <Button type="submit" variant={on ? "primary" : "outline"} size="sm" aria-pressed={on}>
                    {o.nombre || o.id}
                  </Button>
                </form>
              );
            })}
          </div>
        </Card>
      )}

      {quota.enabled && missingAi > 0 && (
        <Card className="flex flex-col gap-2">
          <p className="font-extrabold">Imágenes con IA</p>
          <GenerateAllImages id={id} missing={missingAi} left={quota.left} />
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {slideProps.map((p) => (
          <SlideEditor key={p.slide.n} carouselId={id} slide={p.slide} total={p.total} kit={kit} bg={bg} handle={handle} image={p.imageUrl ? { url: p.imageUrl, x: p.focal!.x, y: p.focal!.y } : null} attemptsLeft={attemptsLeft(row, p.slide.n)} aiImages={{ enabled: quota.enabled, left: quota.left }} />
        ))}
      </div>

      <Card className="flex flex-col gap-3">
        <p className="font-extrabold">Descargar</p>
        {missing > 0 && <p className="text-xs text-ink-600">Te faltan {missing} imágenes por subir. Puedes descargar ya y se verán con el fondo liso, o subirlas antes.</p>}
        <ExportButtons items={slideProps} name={content.titulo} />
      </Card>

      {row.fullRedos < MAX_FULL_REDO ? (
        <RegenerateForm id={id} left={MAX_FULL_REDO - row.fullRedos} />
      ) : (
        <p className="text-xs text-ink-500">Ya rehiciste todo el carrusel dos veces. Sigue ajustando slide por slide.</p>
      )}
    </>
  );
}

