import { Download } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink, Card, Chip, PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { formatDate } from "@/lib/billing/labels";
import { getManual, getOverview } from "@/lib/brujula/service";
import { dayLabel, endTime } from "@/lib/brujula/schedule";

export const metadata: Metadata = { title: "Mi manual de identidad" };

export default async function ManualPage() {
  const { user } = await requireCreatorAccess();
  const [manual, overview] = await Promise.all([getManual(user.id), getOverview(user.id)]);

  if (!manual) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Steps overview={overview} current="manual" />
        <PageHeader eyebrow="Mi marca" title="Tu manual" />
        <Card>
          <p className="font-extrabold">Todavía no hay manual</p>
          <p className="mt-1 text-sm text-ink-600">Se arma solo cuando terminas los 6 bloques de tu brújula.</p>
          <ButtonLink href="/mi-marca/brujula" className="mt-4" size="sm">
            Ir a mi brújula
          </ButtonLink>
        </Card>
      </div>
    );
  }

  const m = manual.content;
  const { palette, tone, typography, recording, pillars } = m.creative;
  const missing = [!m.complete.voz && "tu voz", !m.complete.horario && "tu horario"].filter(Boolean);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Steps overview={overview} current="manual" />
      <PageHeader
        eyebrow={`Actualizado el ${formatDate(manual.generatedAt)}`}
        title="Tu manual de identidad"
        action={
          <ButtonLink href="/api/manual/pdf" prefetch={false} variant="dark" size="sm">
            <Download className="size-4" aria-hidden /> PDF
          </ButtonLink>
        }
      />
      {missing.length > 0 && (
        <p className="rounded-xl bg-naranja-100 p-4 text-sm text-ink-900">
          Tu manual está incompleto: falta {missing.join(" y ")}. Cuando lo hagas se suma solo.
        </p>
      )}

      <Card className="flex flex-col gap-2">
        <h2 className="font-display text-3xl">{m.identity.displayName}</h2>
        <p className="text-sm text-ink-500">
          {m.identity.profession} · {m.identity.niche}
        </p>
        <p className="mt-2 text-ink-800">{m.identity.story}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip tone="azul">Etapa: {m.stage.label}</Chip>
          <Chip>Objetivo: {m.identity.goal}</Chip>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-extrabold">Pilares de contenido</h2>
        <ol className="mt-3 flex flex-col gap-3">
          {pillars.map((p, i) => (
            <li key={p.name} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-azul text-sm font-extrabold text-blanco">{i + 1}</span>
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-ink-600">{p.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-sm font-extrabold">Tono de voz</h2>
          <p className="mt-2 text-sm text-ink-800">{tone.summary}</p>
          <p className="mt-3 text-xs font-semibold text-exito">Haz</p>
          <ul className="list-disc pl-5 text-sm text-ink-700">{tone.do.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="mt-3 text-xs font-semibold text-alerta">Evita</p>
          <ul className="list-disc pl-5 text-sm text-ink-700">{tone.avoid.map((t) => <li key={t}>{t}</li>)}</ul>
        </Card>

        <Card>
          <h2 className="text-sm font-extrabold">Paleta · {palette.name}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {palette.colors.map((c) => (
              <li key={c.hex + c.role} className="flex items-center gap-3">
                <span className="size-11 shrink-0 rounded-lg ring-1 ring-ink-200" style={{ background: c.hex }} aria-hidden />
                <span className="text-xs">
                  <span className="block font-semibold">{c.name}</span>
                  <span className="block text-ink-500">
                    {c.role} · {c.hex.toUpperCase()}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-sm font-extrabold">Tipografías</h3>
          <p className="text-sm text-ink-800">{typography.headline}</p>
          <p className="text-sm text-ink-800">{typography.body}</p>
          <p className="mt-1 text-xs text-ink-500">{typography.note}</p>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-extrabold">Estilo de grabación</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-ink-800">{recording.style.map((s) => <li key={s}>{s}</li>)}</ul>
        <p className="mt-2 text-sm text-ink-600">{recording.framing}</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold">Perfil de voz</h2>
            {m.voiceIsMock && <Chip tone="naranja">Prueba</Chip>}
          </div>
          {m.voice ? <p className="mt-2 text-sm text-ink-800">{m.voice.summary}</p> : <p className="mt-2 text-sm text-ink-500">Pendiente. <a className="font-semibold text-azul underline" href="/mi-marca/voz">Grabar mi voz</a></p>}
        </Card>
        <Card>
          <h2 className="text-sm font-extrabold">Horario de grabación</h2>
          {m.schedule ? (
            <ul className="mt-2 text-sm text-ink-800">
              {m.schedule.blocks.map((b, i) => (
                <li key={i}>
                  {dayLabel(b.day)} · {b.start} a {endTime(b.start, b.minutes)} h {b.kind === "respaldo" && <span className="text-ink-500">(respaldo)</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-500">Pendiente. <a className="font-semibold text-azul underline" href="/mi-marca/horario">Definir mi horario</a></p>
          )}
        </Card>
      </div>
    </div>
  );
}
