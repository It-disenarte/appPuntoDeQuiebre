import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Button, ButtonLink, Card, Chip, PageHeader } from "@/components/ui";
import { GenerateTexts, TextsPanel, type TextsView } from "@/components/plan/TextsPanel";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { setStatusAction } from "@/lib/plan/actions";
import { CATEGORY_LABEL, DAY_NAMES, dowMon0 } from "@/lib/plan/rules";
import { getPiece, parseReview, parseScript, parseTexts } from "@/lib/plan/service";
import type { CarruselGuion, VideoGuion } from "@/lib/skills/schemas";
import { z } from "zod";

export const metadata: Metadata = { title: "Pieza" };

const Part = ({ title, children }: { title: string; children: ReactNode }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</p>
    <div className="mt-1 text-sm text-ink-900">{children}</div>
  </div>
);

const variantSchema = z.object({ gancho_b: z.string().nullable().default(null), angulo_b: z.string().nullable().default(null) }).partial();

export default async function PiezaPage({ params }: PageProps<"/semana/[id]">) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { user } = await requireCreatorAccess();
  const piece = await getPiece(user.id, id);
  if (!piece) notFound();

  const script = parseScript(piece.kind, piece.script);
  const texts = parseTexts(piece.texts);
  const review = parseReview(piece.textsReview);
  const variant = variantSchema.safeParse(piece.variant);

  const view: TextsView | null =
    texts && review
      ? {
          ganchos: texts.ganchos,
          elegido: review.ganchoElegido,
          modo: review.modo,
          redes: {
            ...(texts.instagram ? { instagram: { texto: texts.instagram.texto, hashtags: texts.instagram.hashtags, extra: texts.instagram.primer_comentario ? `Primer comentario: ${texts.instagram.primer_comentario}` : undefined } } : {}),
            ...(texts.tiktok ? { tiktok: { texto: texts.tiktok.texto, hashtags: texts.tiktok.hashtags, extra: texts.tiktok.texto_en_pantalla ? `Texto en pantalla: ${texts.tiktok.texto_en_pantalla}` : undefined } } : {}),
            ...(texts.facebook ? { facebook: { texto: texts.facebook.texto, hashtags: texts.facebook.hashtags } } : {}),
          },
          votos: review.votos,
          edits: review.edits,
          datos: texts.datos_a_verificar,
        }
      : null;

  const day = `${DAY_NAMES[dowMon0(piece.day)]} ${Number(piece.day.slice(8, 10))}`;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader eyebrow={`${day} · ${piece.publishTime} h`} title={piece.topic} />
      <div className="flex flex-wrap gap-2">
        <Chip tone="azul">{piece.kind === "video" ? "Video" : "Carrusel"}</Chip>
        <Chip>{CATEGORY_LABEL[piece.category]}</Chip>
        <Chip tone={piece.type === "prueba" ? "naranja" : "neutral"}>{piece.type === "prueba" ? "Prueba" : "Probado"}</Chip>
        <Chip>{piece.pillar}</Chip>
      </div>
      {piece.idea && <p className="text-ink-700">{piece.idea}</p>}
      {piece.testCard && <p className="rounded-xl bg-naranja-100 p-4 text-sm text-ink-900">{piece.testCard}</p>}

      <Card className="flex flex-col gap-4">
        <h2 className="font-extrabold">Guion</h2>
        {!script ? (
          <p className="text-sm text-ink-500">El guion de esta pieza no está disponible.</p>
        ) : piece.kind === "video" ? (
          <>
            <Part title="Gancho (primeros 3 segundos)">{(script as VideoGuion).gancho}</Part>
            <Part title="Cuerpo">
              <ol className="list-decimal pl-5">
                {(script as VideoGuion).cuerpo.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            </Part>
            <Part title="Cierre">{(script as VideoGuion).cierre}</Part>
            <p className="text-xs text-ink-500">
              Unos {(script as VideoGuion).duracion_segundos} segundos. {(script as VideoGuion).nota_grabacion}
            </p>
            {piece.type === "prueba" && variant.success && (variant.data.gancho_b || variant.data.angulo_b) && (
              <Part title={variant.data.gancho_b ? "Gancho B (graba el mismo cuerpo con este gancho)" : "Otro ángulo"}>{variant.data.gancho_b ?? variant.data.angulo_b}</Part>
            )}
          </>
        ) : (
          <>
            <Part title="Título de la portada">{(script as CarruselGuion).titulo}</Part>
            {(script as CarruselGuion).idea_central && <Part title="Idea central">{(script as CarruselGuion).idea_central}</Part>}
            <Part title="Puntos">
              <ol className="list-decimal pl-5">
                {(script as CarruselGuion).puntos.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            </Part>
            {(script as CarruselGuion).cierre && <Part title="Cierre">{(script as CarruselGuion).cierre}</Part>}
          </>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {piece.kind === "video" && (
            <ButtonLink href={`/grabar?pieza=${piece.id}`} size="sm">
              Ir a grabar
            </ButtonLink>
          )}
          <form action={setStatusAction} className="inline">
            <input type="hidden" name="id" value={piece.id} />
            <input type="hidden" name="status" value={piece.status === "grabado" ? "pendiente" : "grabado"} />
            <Button type="submit" variant="outline" size="sm">
              {piece.status === "grabado" ? "Marcar como pendiente" : "Ya la grabé"}
            </Button>
          </form>
        </div>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="textos">
        <h2 id="textos" className="text-lg font-extrabold">
          Textos de publicación
        </h2>
        {view ? (
          <>
            <TextsPanel id={piece.id} view={view} />
            <GenerateTexts id={piece.id} again />
          </>
        ) : (
          <Card className="flex flex-col gap-3">
            <p className="text-sm text-ink-700">Escribimos un texto distinto para cada una de tus redes, con tu voz y con 3 ganchos para que elijas.</p>
            <GenerateTexts id={piece.id} />
          </Card>
        )}
      </section>

      <Link href="/semana" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
        Volver a mi semana
      </Link>
    </div>
  );
}
