import type { Metadata } from "next";
import Link from "next/link";
import { AuditButton } from "@/components/instagram/AuditButton";
import { Button, ButtonLink, Card, Chip, PageHeader } from "@/components/ui";
import { voteCardAction } from "@/lib/audit-account/actions";
import { getAudit, parseAudit, parseVotes } from "@/lib/audit-account/service";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { getConnection } from "@/lib/instagram/service";

export const metadata: Metadata = { title: "Así te vemos" };

const KIND = { tema: "Tema", tono: "Tono", visual: "Visual", publico: "Público", habito: "Hábito" } as const;

export default async function AuditoriaPage() {
  const { user } = await requireCreatorAccess();
  const conn = await getConnection(user.id);
  const row = conn ? await getAudit(user.id) : null;
  const out = row && parseAudit(row.result);
  const votes = row ? parseVotes(row.votes) : {};

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader eyebrow="Mi marca" title="Así te vemos" />
      {!conn ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-ink-700">Para revisar tu cuenta primero conéctala con el acceso oficial de Instagram (solo lectura).</p>
          <ButtonLink href="/mi-marca/instagram" size="sm" className="self-start">
            Conectar mi Instagram
          </ButtonLink>
        </Card>
      ) : !out ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-ink-700">Miramos tus últimas publicaciones para partir de lo que ya haces, no solo de lo que nos cuentas. Todo lo que veas aquí es una <strong>hipótesis</strong>: tú nos dices si acertamos.</p>
          <AuditButton />
        </Card>
      ) : (
        <>
          {row?.mock && <p className="rounded-lg bg-naranja-100 p-3 text-xs text-ink-900">Es una revisión de ejemplo (sin IA o con pocas publicaciones): con la IA activa se analiza el contenido de verdad.</p>}
          {out.modo === "sin_contenido" ? (
            <Card className="flex flex-col gap-2">
              <p className="font-extrabold">Todavía tienes pocas publicaciones para revisar</p>
              <p className="text-sm text-ink-700">Con menos de 9 publicaciones no adivinamos nada: partimos de lo que tú nos cuentas.</p>
            </Card>
          ) : (
            <>
              <Card className="grid grid-cols-3 gap-3 text-center text-sm">
                <div>
                  <p className="font-display text-2xl">{out.numeros_clave.publicaciones_analizadas}</p>
                  <p className="text-xs text-ink-600">publicaciones revisadas</p>
                </div>
                <div>
                  <p className="font-display text-2xl capitalize">{out.numeros_clave.formato_que_mas_alcanza || "—"}</p>
                  <p className="text-xs text-ink-600">formato que más alcanza</p>
                </div>
                <div>
                  <p className="font-display text-2xl">{out.numeros_clave.mejor_hora || "—"}</p>
                  <p className="text-xs text-ink-600">mejor hora</p>
                </div>
              </Card>
              <h2 className="font-extrabold">¿Así te ves?</h2>
              {out.tarjetas.map((t) => (
                <Card key={t.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Chip tone="azul">{KIND[t.tipo]}</Chip>
                    {votes[t.id] && <Chip tone="exito">Respondida</Chip>}
                  </div>
                  <p className="font-semibold">{t.texto}</p>
                  <form action={voteCardAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="tarjeta" value={t.id} />
                    {(["si", "no", "ajustar"] as const).map((v) => (
                      <Button key={v} type="submit" name="voto" value={v} size="sm" variant={votes[t.id]?.voto === v ? "primary" : "outline"} aria-pressed={votes[t.id]?.voto === v}>
                        {v === "si" ? "Sí" : v === "no" ? "No" : "Ajustar"}
                      </Button>
                    ))}
                  </form>
                </Card>
              ))}
              {out.dices_vs_publicas?.comentario && (
                <Card className="flex flex-col gap-1">
                  <p className="font-extrabold">Lo que dices y lo que publicas</p>
                  <p className="text-sm">{out.dices_vs_publicas.comentario}</p>
                </Card>
              )}
              {out.top_publicaciones.length > 0 && (
                <Card className="flex flex-col gap-1">
                  <p className="font-extrabold">Tus publicaciones que mejor funcionaron</p>
                  <ul className="list-disc pl-5 text-sm">
                    {out.top_publicaciones.map((p) => (
                      <li key={p.id}>{p.por_que_funciono}</li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
          {out.preguntas_pendientes.length > 0 && (
            <Card className="flex flex-col gap-1">
              <p className="font-extrabold">Lo que solo tú nos puedes contar</p>
              <ul className="list-disc pl-5 text-sm">
                {out.preguntas_pendientes.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </Card>
          )}
          <AuditButton again />
        </>
      )}
      <Link href="/mi-marca" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
        Volver a Mi marca
      </Link>
    </div>
  );
}
