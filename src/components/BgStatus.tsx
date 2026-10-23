import { GeneratingCard } from "@/components/brujula/GeneratingCard";
import { Poller } from "@/components/metrics/Poller";
import { BG_LABEL, latestBg } from "@/lib/bg";
import { shownError } from "@/lib/shown-error";

/**
 * Estado del último paso con IA de una pantalla: mientras corre muestra el avance (la página se refresca sola) y, si falló hace poco,
 * el motivo. Se pone arriba de la pantalla; si no hay nada que mostrar, no pinta nada.
 */
export async function BgStatus({ userId, scope }: { userId: string; scope: string }) {
  const job = await latestBg(userId, scope);
  if (!job) return null;
  if (job.active) {
    return (
      <>
        <Poller everyMs={3000} />
        <GeneratingCard since={job.createdAt.getTime()} title={BG_LABEL[job.op].title} text={BG_LABEL[job.op].text} />
      </>
    );
  }
  if (job.recent && job.status === "error") {
    return (
      <p role="alert" className="rounded-xl bg-alerta-100 p-4 text-sm font-semibold text-alerta">
        No pudimos completar este paso: {await shownError(userId, job.error, "algo falló")} Inténtalo de nuevo.
      </p>
    );
  }
  return null;
}
