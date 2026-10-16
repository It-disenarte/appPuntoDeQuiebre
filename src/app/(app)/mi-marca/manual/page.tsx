import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, ButtonLink, Card, Chip, FormSuccess, PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { formatDate } from "@/lib/billing/labels";
import { generateManualAction } from "@/lib/brujula/actions";
import { labelOf, FORMATS } from "@/lib/brujula/content";
import { getManual, getOverview, MAX_ADJUSTMENTS } from "@/lib/brujula/service";
import { MANUAL_SECTIONS, type BrujulaV2, type SectionId } from "@/lib/skills/schemas";
import { VoteForm } from "./VoteForm";

export const metadata: Metadata = { title: "Mi brújula" };

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-xs text-ink-500">{label}</dt>
    <dd className="text-sm text-ink-900">{children}</dd>
  </div>
);
const Pills = ({ items, tone = "azul" as const }: { items: string[]; tone?: "azul" | "neutral" }) => (
  <div className="flex flex-wrap gap-2">
    {items.map((x) => (
      <Chip key={x} tone={tone}>
        {x}
      </Chip>
    ))}
  </div>
);

function SectionBody({ id, m }: { id: SectionId; m: BrujulaV2 }) {
  switch (id) {
    case "nicho":
      return (
        <dl className="flex flex-col gap-3">
          <Row label="Nicho">
            <strong>{m.nicho.principal}</strong> · {m.nicho.enfoque}
          </Row>
          <Row label="Propuesta de valor">{m.propuesta_valor}</Row>
          <Row label="Frase de marca">“{m.frase_de_marca}”</Row>
        </dl>
      );
    case "publico":
      return (
        <dl className="flex flex-col gap-3">
          <Row label="Tu público">{m.publico.descripcion}</Row>
          <Row label="Edad">{m.publico.rango_edad}</Row>
          <Row label="Lo que les duele">
            <ul className="list-disc pl-5">{m.publico.dolores.map((x) => <li key={x}>{x}</li>)}</ul>
          </Row>
          <Row label="Lo que desean">
            <ul className="list-disc pl-5">{m.publico.deseos.map((x) => <li key={x}>{x}</li>)}</ul>
          </Row>
        </dl>
      );
    case "pilares":
      return (
        <ol className="flex flex-col gap-3">
          {m.pilares.map((p, i) => (
            <li key={p.nombre} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-azul text-sm font-extrabold text-blanco">{i + 1}</span>
              <div>
                <p className="font-semibold">
                  {p.nombre} <Chip>{p.categoria_dominante}</Chip>
                </p>
                <p className="text-sm text-ink-600">{p.descripcion}</p>
                <p className="mt-1 text-xs text-ink-500">Ideas: {p.ideas_de_tema.join(" · ")}</p>
              </div>
            </li>
          ))}
        </ol>
      );
    case "tono":
      return (
        <dl className="flex flex-col gap-3">
          <Row label="Tono">
            <Pills items={m.tono.adjetivos} />
            <span className="mt-2 block">{m.tono.descripcion}</span>
          </Row>
          <Row label="Palabras que sí usas">
            <Pills items={m.palabras_si} />
          </Row>
          <Row label="Palabras que evitas">
            <Pills items={m.palabras_no} tone="neutral" />
          </Row>
        </dl>
      );
    default:
      return (
        <dl className="flex flex-col gap-3">
          <Row label="Postura">{m.postura}</Row>
          {m.puente && <Row label="Puente">{m.puente}</Row>}
          <Row label="Visión">
            Hoy: {m.vision.hoy}
            <br />
            Después: {m.vision.despues}
          </Row>
          <Row label="Estilo de grabación">
            {labelOf(FORMATS, m.estilo_grabacion.formato_principal)} · {m.estilo_grabacion.descripcion}
          </Row>
        </dl>
      );
  }
}

export default async function ManualPage({ searchParams }: PageProps<"/mi-marca/manual">) {
  const { user } = await requireCreatorAccess();
  const params = await searchParams;
  const [manual, overview] = await Promise.all([getManual(user.id), getOverview(user.id)]);

  if (!manual) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Steps overview={overview} current="brujula" />
        <PageHeader eyebrow="Mi marca" title="Tu brújula" />
        {params.limite && <p className="rounded-xl bg-naranja-100 p-4 text-sm">Ya generaste varias veces seguidas. Intenta de nuevo en una hora.</p>}
        {overview.story.ready ? (
          <Card className="flex flex-col gap-3">
            <p className="font-extrabold">Todo listo para armar tu brújula</p>
            <p className="text-sm text-ink-600">Con lo que nos contaste armamos tu nicho, tu público, tus pilares y tu tono. Después los revisas sección por sección.</p>
            <form action={generateManualAction}>
              <Button type="submit" size="lg">
                Generar mi brújula
              </Button>
            </form>
          </Card>
        ) : (
          <Card>
            <p className="font-extrabold">Primero cuéntanos tu historia</p>
            <p className="mt-1 text-sm text-ink-600">Tu brújula se arma con tus respuestas y tus elecciones rápidas.</p>
            <ButtonLink href={overview.next?.href ?? "/mi-marca/historia"} className="mt-4" size="sm">
              {overview.next?.text ?? "Ir a mi historia"}
            </ButtonLink>
          </Card>
        )}
      </div>
    );
  }

  const approved = manual.status === "aprobado";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Steps overview={overview} current="brujula" />
      <PageHeader
        eyebrow={`Generada el ${formatDate(manual.generatedAt)}`}
        title="Tu brújula de marca"
        action={
          approved ? (
            <ButtonLink href="/api/manual/pdf" prefetch={false} variant="dark" size="sm">
              <Download className="size-4" aria-hidden /> PDF
            </ButtonLink>
          ) : undefined
        }
      />
      <FormSuccess message={approved ? "¡Tu brújula está aprobada! Ya puedes descargarla en PDF." : undefined} />
      {manual.mock && (
        <p className="rounded-xl bg-naranja-100 p-4 text-sm text-ink-900">
          <strong>Versión de prueba.</strong> Esta brújula la armó un generador de reglas, no la IA. Úsala para conocer cómo funciona el proceso; el contenido real llega cuando se conecte la IA.
        </p>
      )}
      {!approved && <p className="text-ink-700">Revisa cada sección y califícala. Cuando las {MANUAL_SECTIONS.length} tengan 👍, tu brújula queda lista.</p>}
      <p className="rounded-xl bg-azul-50 p-4 text-sm text-ink-800">{manual.content.mensaje_al_creador}</p>

      {MANUAL_SECTIONS.map((s) => {
        const v = manual.votes[s.id];
        const ok = v?.voto === "si";
        const used = v?.ajustes ?? 0;
        return (
          <Card key={s.id} id={s.id} className="flex flex-col gap-4 scroll-mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-extrabold">{s.title}</h2>
              {ok ? <Chip tone="exito">Aprobada</Chip> : used > 0 ? <Chip tone="naranja">Ajustada · falta tu calificación</Chip> : <Chip>Por calificar</Chip>}
            </div>
            <SectionBody id={s.id} m={manual.content} />
            {!ok && <VoteForm section={s.id} adjustmentsLeft={MAX_ADJUSTMENTS - used} />}
          </Card>
        );
      })}

      {manual.content.datos_faltantes.length > 0 && (
        <Card>
          <h2 className="text-sm font-extrabold">Lo que todavía nos falta saber</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-ink-700">{manual.content.datos_faltantes.map((d) => <li key={d}>{d}</li>)}</ul>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/mi-marca/voz" className="font-semibold text-azul underline underline-offset-4">
          Ver mi perfil de voz
        </Link>
        <form action={generateManualAction}>
          <button type="submit" className="tap font-semibold text-ink-600 underline underline-offset-4">
            Rehacer mi brújula
          </button>
        </form>
      </div>
    </div>
  );
}
