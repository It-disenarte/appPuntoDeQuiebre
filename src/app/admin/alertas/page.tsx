import type { Metadata } from "next";
import Link from "next/link";
import { Card, Chip, PageHeader } from "@/components/ui";
import { ALERT_LABEL, currentAlerts } from "@/lib/admin/insights";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Alertas" };

const TONE = { inactivo: "naranja", racha_rota: "naranja", alta_atrasada: "azul", pago: "alerta" } as const;

export default async function AlertasPage() {
  await requireAdmin();
  const alerts = await currentAlerts();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${alerts.length} ${alerts.length === 1 ? "alerta" : "alertas"}`} title="Alertas de abandono" />
      <p className="text-sm text-ink-600">Clientes con acceso que necesitan un empujón: sin actividad por 7 días o más, racha rota, alta sin terminar en 10 días o pago en mora. Escríbeles antes de que se vayan.</p>
      <Card className="p-0">
        {alerts.length === 0 ? (
          <p className="p-5 text-sm text-ink-500">Nadie en riesgo por ahora. 🎉</p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {alerts.map((a, i) => (
              <li key={`${a.userId}-${a.kind}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <Link href={`/admin/clientes/${a.userId}`} className="font-semibold text-azul underline underline-offset-4">
                    {a.name}
                  </Link>
                  <p className="text-xs text-ink-500">{a.email}</p>
                  <p className="text-sm text-ink-700">{a.detail}</p>
                </div>
                <Chip tone={TONE[a.kind]}>{ALERT_LABEL[a.kind]}</Chip>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
