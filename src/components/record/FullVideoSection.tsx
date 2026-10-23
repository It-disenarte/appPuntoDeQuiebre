import Link from "next/link";
import { Poller } from "@/components/metrics/Poller";
import { Button } from "@/components/ui";
import { megabytes } from "@/lib/recording/rules";
import { getExport, isOutdated } from "@/lib/recording/join";
import { requestJoinAction } from "@/lib/recording/actions";
import { shownError } from "@/lib/shown-error";

/** Video completo (las 3 partes unidas en un MP4 vertical) para descargar y subir a Instagram, TikTok o Facebook. */
export async function FullVideoSection({ userId, pieceId }: { userId: string; pieceId: string }) {
  const exp = await getExport(userId, pieceId);
  const outdated = await isOutdated(userId, pieceId, exp);
  const working = exp?.status === "procesando";
  const join = (label: string, variant: "light" | "ghost" = "light") => (
    <form action={requestJoinAction}>
      <input type="hidden" name="pieza" value={pieceId} />
      <Button type="submit" variant={variant} className={variant === "ghost" ? "text-blanco hover:bg-ink-700" : undefined}>
        {label}
      </Button>
    </form>
  );
  return (
    <section id="video" className="flex scroll-mt-4 flex-col gap-3 rounded-card bg-ink-800 p-4" aria-label="Video completo">
      {working && <Poller />}
      <h2 className="font-extrabold">Tu video completo</h2>
      {!exp && (
        <>
          <p className="text-sm text-ink-300">Unimos tu gancho, cuerpo y cierre en un solo video vertical (1080 × 1920) listo para subir.</p>
          {join("Armar mi video completo")}
        </>
      )}
      {working && (
        <p className="text-sm" aria-live="polite">
          Armando tu video… puede tardar un par de minutos. Puedes salir: te avisamos.
        </p>
      )}
      {exp?.status === "error" && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-alerta-100">
            No pudimos armarlo: {await shownError(userId, exp.error, "algo falló")}
          </p>
          {join("Reintentar")}
        </div>
      )}
      {exp?.status === "lista" && (
        <>
          {outdated && <p className="rounded-lg bg-naranja-100 p-3 text-xs text-ink-900">Regrabaste una parte después de armar este video. Vuélvelo a armar para que incluya tu toma nueva.</p>}
          <video src={`/api/grabaciones/video/${pieceId}`} controls playsInline preload="metadata" className="mx-auto aspect-9/16 max-h-[60dvh] w-auto max-w-full rounded-lg bg-negro" />
          <p className="text-xs text-ink-300">
            {exp.seconds ?? 0} s · {megabytes(exp.bytes ?? 0)} MB
          </p>
          <p className="rounded-lg bg-ink-700 p-3 text-xs text-ink-200">
            Este es tu video <strong>solo unido</strong>, sin editar. Para quitar silencios y muletillas, poner subtítulos, acercamientos y portada, usa{" "}
            <a href="#edicion" className="font-semibold text-azul-100 underline underline-offset-4">
              Edición automática
            </a>{" "}
            aquí abajo (plan Pro).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a href={`/api/grabaciones/video/${pieceId}?descargar=1`} className="tap inline-flex items-center rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
              Descargar video
            </a>
            {outdated && join("Volver a armarlo", "ghost")}
          </div>
          <p className="text-xs text-ink-300">
            Los videos se conservan 30 días: descárgalo antes. Súbelo desde tu celular a Instagram, TikTok o Facebook. Los textos de cada red (con hashtags) los copias en{" "}
            <Link href={`/semana/${pieceId}`} className="font-semibold text-azul-100 underline underline-offset-4">
              tu pieza
            </Link>
            .
          </p>
        </>
      )}
    </section>
  );
}
