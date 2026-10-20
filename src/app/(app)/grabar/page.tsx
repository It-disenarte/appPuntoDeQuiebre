import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { EditSection } from "@/components/record/EditSection";
import { FullVideoSection } from "@/components/record/FullVideoSection";
import { CoachSection } from "@/components/record/CoachSection";
import { RecordingStudio } from "@/components/record/RecordingStudio";
import { Card, Chip, PageHeader } from "@/components/ui";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { DAY_NAMES, dowMon0 } from "@/lib/plan/rules";
import { getPiece, parseScript } from "@/lib/plan/service";
import { deleteRecordingAction } from "@/lib/recording/actions";
import { PART_LABEL, partTexts, type Part } from "@/lib/recording/rules";
import { listRecordings, recordablePieces } from "@/lib/recording/service";
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
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 select-none [-webkit-touch-callout:none]">
        <PageHeader dark eyebrow="Estudio" title="¿Qué vas a grabar?" />
        {pieces.length === 0 ? (
          <Card className="flex flex-col gap-2 bg-ink-800 text-blanco">
            <p className="font-extrabold">Todavía no tienes videos en tu semana</p>
            <p className="text-sm text-ink-300">Genera tu semana y aquí aparecerán tus videos con su guion para grabarlos.</p>
            <Link href="/semana" className="self-start text-sm font-semibold text-azul-100 underline underline-offset-4">
              Ir a mi semana
            </Link>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {pieces.map((p) => (
              <li key={p.id}>
                <Link href={`/grabar?pieza=${p.id}`} className="flex items-center justify-between gap-3 rounded-card bg-ink-800 p-4 hover:bg-ink-700">
                  <span>
                    <span className="block text-xs text-ink-400">{dayLabel(p.day)}</span>
                    <span className="block font-extrabold">{p.topic}</span>
                  </span>
                  <Chip tone={p.status === "grabado" ? "azul" : "neutral"}>{p.status === "grabado" ? "Grabado" : "Por grabar"}</Chip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const recs = await listRecordings(user.id, piece.id);
  const done = recs.map((r) => ({ part: r.part as Part, id: r.id, seconds: r.seconds }));
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 select-none [-webkit-touch-callout:none]">
      <PageHeader dark eyebrow={`Video · ${dayLabel(piece.day)}`} title={piece.topic} />
      {!storageConfigured() ? (
        <Card className="bg-ink-800 text-blanco">
          <p className="text-sm">El almacenamiento de videos todavía no está configurado, así que no se pueden subir grabaciones.</p>
        </Card>
      ) : (
        <RecordingStudio pieceId={piece.id} texts={partTexts(script)} done={done} />
      )}

      {recs.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Partes subidas">
          <h2 className="font-extrabold">Partes subidas</h2>
          {(["gancho", "cuerpo", "cierre"] as const)
            .map((p) => recs.find((r) => r.part === p))
            .filter((r): r is NonNullable<typeof r> => Boolean(r))
            .map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-card bg-ink-800 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    {PART_LABEL[r.part as Part]} · {r.seconds} s
                  </p>
                  <form action={deleteRecordingAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="tap rounded-full px-3 text-xs font-semibold text-ink-300 underline underline-offset-4">
                      Borrar
                    </button>
                  </form>
                </div>
                {r.purgedAt ? <p className="text-xs text-ink-300">Este archivo se borró por antigüedad (se conservan 30 días).</p> : <video src={`/api/grabaciones/${r.id}`} controls playsInline preload="metadata" className="aspect-3/4 max-h-72 w-full rounded-lg bg-negro object-cover" />}
              </div>
            ))}
        </section>
      )}
      {done.length === 3 && <FullVideoSection userId={user.id} pieceId={piece.id} />}
      {done.length === 3 && <EditSection userId={user.id} pieceId={piece.id} mode={typeof params.modo === "string" ? params.modo : undefined} />}
      {done.length === 3 && <CoachSection userId={user.id} pieceId={piece.id} />}
      <Link href={`/semana/${piece.id}`} className="self-start text-sm font-semibold text-azul-100 underline underline-offset-4">
        Ver el guion completo
      </Link>
    </div>
  );
}
