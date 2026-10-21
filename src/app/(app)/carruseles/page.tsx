import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { BriefForm } from "@/components/carousel/Steps";
import { Card, Chip, PageHeader } from "@/components/ui";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { listCarousels, parseBrief, parseContent } from "@/lib/carousel/service";
import { getSubscription } from "@/lib/billing/service";
import { getPiece } from "@/lib/plan/service";

export const metadata: Metadata = { title: "Carruseles" };

export default async function CarruselesPage({ searchParams }: PageProps<"/carruseles">) {
  const { user } = await requireCreatorAccess();
  const params = await searchParams;
  const pieceId = typeof params.pieza === "string" && z.string().uuid().safeParse(params.pieza).success ? params.pieza : undefined;
  const piece = pieceId ? await getPiece(user.id, pieceId) : null;
  // Viene del analizador (“Hacer un carrusel con esto”): el tema ya llega escrito.
  const askedTema = typeof params.tema === "string" ? params.tema.trim().slice(0, 140) : "";
  const list = await listCarousels(user.id);
  const plan = (await getSubscription(user.id))?.plan ?? "basico";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow="Publicar" title="Carruseles" />
      <Card data-tour="nuevo" className="flex flex-col gap-4">
        <h2 className="text-lg font-extrabold">Crear un carrusel nuevo</h2>
        <p className="text-sm text-ink-700">Te proponemos la idea, escribimos cada slide con tu voz y lo armamos con tu kit visual. Sales con imágenes listas para subir, sin saber diseñar.</p>
        <BriefForm tema={piece?.kind === "carrusel" ? piece.topic : askedTema} pieza={piece?.kind === "carrusel" ? piece.id : undefined} plan={plan} />
      </Card>

      {list.length > 0 && (
        <section data-tour="mis-carruseles" className="flex flex-col gap-2" aria-label="Mis carruseles">
          <h2 className="text-lg font-extrabold">Mis carruseles</h2>
          {list.map((c) => {
            const brief = parseBrief(c.brief);
            const content = parseContent(c.content);
            return (
              <Link key={c.id} href={`/carruseles/${c.id}`} className="flex items-center justify-between gap-3 rounded-card bg-blanco p-4 shadow-card hover:bg-ink-50">
                <span>
                  <span className="block font-extrabold">{content?.titulo ?? brief?.tema ?? "Carrusel"}</span>
                  <span className="block text-xs text-ink-500">{c.createdAt.toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" })}</span>
                </span>
                <span className="flex gap-2">
                  {c.mock && <Chip tone="naranja">Ejemplo</Chip>}
                  <Chip tone={content ? "exito" : "neutral"}>{content ? `${content.slides.length} slides` : "En proceso"}</Chip>
                </span>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
