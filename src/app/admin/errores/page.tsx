import type { Metadata } from "next";
import { Button, Card, Chip, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { resolveAllErrorsAction, resolveErrorAction } from "@/lib/admin/actions";
import { REPEAT_THRESHOLD, isRepeating, listErrors } from "@/lib/errors";

export const metadata: Metadata = { title: "Errores del sistema" };

const SOURCE = { pagina: "Página o acción", trabajo: "Trabajo en segundo plano", ia: "Llamada a la IA", webhook: "Stripe (webhook)" } as const;
const dateFmt = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });

export default async function ErroresPage() {
  await requireAdmin();
  const [open, closed] = await Promise.all([listErrors({ resolved: false, limit: 100 }), listErrors({ resolved: true, limit: 15 })]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${open.length} sin atender`} title="Errores del sistema" action={open.length > 0 ? <form action={resolveAllErrorsAction}><Button type="submit" variant="outline" size="sm">Marcar todos como atendidos</Button></form> : undefined} />
      <p className="text-sm text-ink-600">Aquí se anota todo lo que falla en la app, en los trabajos en segundo plano, en la IA o en Stripe. El mismo error repetido sale en un solo renglón con su contador; se marca como <strong>se repite</strong> si pasó {REPEAT_THRESHOLD} veces o más en la última hora.</p>
      <Card className="p-0">
        {open.length === 0 ? (
          <p className="p-5 text-sm text-ink-500">Todo en orden: no hay errores sin atender. 🎉</p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {open.map((e) => {
              const repeating = isRepeating(e);
              return (
                <li key={e.id} className="flex flex-col gap-2 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={repeating ? "alerta" : "naranja"}>{repeating ? "Se repite" : SOURCE[e.source]}</Chip>
                    {repeating && <Chip>{SOURCE[e.source]}</Chip>}
                    <span className="text-xs text-ink-500">
                      {e.count} {e.count === 1 ? "vez" : "veces"} · última {dateFmt.format(e.lastAt)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold break-words">{e.message}</p>
                  {e.path && <p className="text-xs text-ink-500">Ruta: {e.path}</p>}
                  <form action={resolveErrorAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Marcar como atendido
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {closed.length > 0 && (
        <Card className="p-0">
          <h2 className="px-5 pt-5 text-sm font-extrabold">Atendidos recientemente</h2>
          <ul className="mt-2 divide-y divide-ink-200 text-sm text-ink-600">
            {closed.map((e) => (
              <li key={e.id} className="px-5 py-2">
                <span className="text-xs text-ink-400">{dateFmt.format(e.lastAt)} · {SOURCE[e.source]}</span>
                <p className="break-words">{e.message}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
