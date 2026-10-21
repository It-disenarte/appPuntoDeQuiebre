"use client";

import { Card } from "@/components/ui";
import { Spinner, useElapsed } from "@/components/ui/LoadingOverlay";

/** Mientras la brújula se arma en segundo plano: la página se refresca sola y esto muestra que sigue trabajando. */
export function GeneratingCard({ since, title = "Armando tu brújula…", text = "Estamos escribiendo tu nicho, tu público, tus pilares, tu tono y tu perfil de voz. Tarda 1 o 2 minutos." }: { since: number; title?: string; text?: string }) {
  const s = useElapsed(since);
  return (
    <Card className="flex flex-col items-center gap-4 py-10 text-center" role="status" aria-live="polite">
      <Spinner />
      <p className="font-display text-3xl">{title}</p>
      <p className="max-w-sm text-sm text-ink-700">{text}</p>
      <p className="text-xs text-ink-500">Llevamos {s} s. Puedes salir de la app: seguirá armándose y aquí estará cuando vuelvas.</p>
    </Card>
  );
}
