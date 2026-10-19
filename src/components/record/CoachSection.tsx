import Link from "next/link";
import { Poller } from "@/components/metrics/Poller";
import { RequestReviewForm } from "@/components/record/CoachForms";
import { Button } from "@/components/ui";
import { declineReviewAction, voteImprovementAction } from "@/lib/coach/actions";
import { AREA_LABEL, MAX_REVIEWS_PER_VIDEO } from "@/lib/coach/schemas";
import { hasNewTake, listReviews, monthlyQuota, parseResult } from "@/lib/coach/service";
import { getSubscription } from "@/lib/billing/service";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** “El Lente”: revisión opcional del video ya grabado (skill 11). */
export async function CoachSection({ userId, pieceId }: { userId: string; pieceId: string }) {
  const [reviews, quota, sub] = await Promise.all([listReviews(userId, pieceId), monthlyQuota(userId), getSubscription(userId)]);
  const real = reviews.filter((r) => r.numero >= 1);
  const declined = reviews.some((r) => r.numero === 0);
  const working = real.find((r) => r.status === "procesando");
  const failed = real.find((r) => r.status === "error");
  const done = real.filter((r) => r.status === "lista");
  const last = done.at(-1);
  const canSecond = Boolean(last && last.numero < MAX_REVIEWS_PER_VIDEO && last.status === "lista" && (await hasNewTake(userId, pieceId, last.createdAt)));
  const left = Math.max(0, quota.limit - quota.used);

  return (
    <section className="flex flex-col gap-3 rounded-card bg-ink-800 p-4" aria-label="El Lente">
      {working && <Poller />}
      <h2 className="font-extrabold">El Lente</h2>

      {real.length === 0 && !working && (
        <>
          <p className="text-sm">{declined ? "Elegiste publicarlo así. Si cambias de opinión, aún puedes pedir la revisión." : "¿Quieres que le echemos un lente?"}</p>
          <p className="text-xs text-ink-300">Vemos y escuchamos tu video y te decimos qué te salió bien y qué puedes mejorar antes de publicar. Te quedan {left} {left === 1 ? "revisión" : "revisiones"} este mes.</p>
          <div className="flex flex-wrap items-start gap-3">
            <RequestReviewForm pieceId={pieceId} label="Sí, échale un lente" />
            {!declined && (
              <form action={declineReviewAction}>
                <input type="hidden" name="pieza" value={pieceId} />
                <Button type="submit" variant="ghost" className="text-blanco hover:bg-ink-700">
                  Así lo publico
                </Button>
              </form>
            )}
          </div>
        </>
      )}

      {working && (
        <p className="text-sm" aria-live="polite">
          Revisando tu video… tarda un par de minutos. Puedes salir: te avisamos.
        </p>
      )}

      {failed && !working && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-alerta-100">
            No pudimos revisar el video: {failed.error ?? "algo falló"}.
          </p>
          <RequestReviewForm pieceId={pieceId} label="Reintentar" />
        </div>
      )}

      {done.map((r) => {
        const out = parseResult(r.result);
        if (!out) return null;
        const votes = (r.votes && typeof r.votes === "object" ? r.votes : {}) as Record<string, { voto?: string }>;
        return (
          <article key={r.id} className="flex flex-col gap-3 rounded-xl bg-ink-700 p-3">
            <p className="text-xs text-ink-300">
              Revisión {r.numero} de {MAX_REVIEWS_PER_VIDEO}
              {r.mock ? " · de ejemplo (sin IA)" : ""}
            </p>
            <p className="font-extrabold">{out.titular}</p>
            <p className="text-sm">
              <strong>✓ Lo que salió bien</strong> <span className="text-ink-300">({AREA_LABEL[out.logro.area]} · {clock(out.logro.segundo)})</span>
              <br />
              {out.logro.texto}
            </p>
            {out.mejoras.map((m, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-lg bg-ink-800 p-3 text-sm">
                <p>
                  <strong>{AREA_LABEL[m.area]}</strong> <span className="text-ink-300">· {clock(m.segundo)}</span>
                </p>
                <p>{m.que_paso}</p>
                <p className="text-ink-100">{m.como_mejorarlo}</p>
                {m.frase_sugerida && <p className="italic">“{m.frase_sugerida}”</p>}
                <form action={voteImprovementAction} className="flex items-center gap-2">
                  <input type="hidden" name="review" value={r.id} />
                  <input type="hidden" name="i" value={i} />
                  <Button type="submit" name="voto" value="si" size="sm" variant={votes[String(i)]?.voto === "si" ? "light" : "ghost"} className="text-blanco" aria-label="Me sirvió" aria-pressed={votes[String(i)]?.voto === "si"}>
                    👍
                  </Button>
                  <Button type="submit" name="voto" value="no" size="sm" variant={votes[String(i)]?.voto === "no" ? "light" : "ghost"} className="text-blanco" aria-label="No me sirvió" aria-pressed={votes[String(i)]?.voto === "no"}>
                    👎
                  </Button>
                </form>
              </div>
            ))}
            {out.comparacion && (out.comparacion.mejoro.length > 0 || out.comparacion.sigue_pendiente.length > 0) && (
              <div className="text-sm">
                {out.comparacion.mejoro.length > 0 && <p>📈 Mejoró: {out.comparacion.mejoro.join(" · ")}</p>}
                {out.comparacion.sigue_pendiente.length > 0 && <p>⏳ Sigue pendiente: {out.comparacion.sigue_pendiente.join(" · ")}</p>}
              </div>
            )}
            <p className="text-sm text-ink-100">{out.cierre}</p>
          </article>
        );
      })}

      {last && !working && (
        <div className="flex flex-wrap items-start gap-3">
          {canSecond && <RequestReviewForm pieceId={pieceId} label="Revisar mi nueva toma" />}
          {last.numero < MAX_REVIEWS_PER_VIDEO && !canSecond && parseResult(last.result)?.veredicto === "otra_toma_opcional" && (
            <p className="text-xs text-ink-300">Si quieres otra toma, vuelve a grabar las partes que quieras y aquí podrás pedir tu segunda revisión.</p>
          )}
          <Link href={`/semana/${pieceId}`} className="tap inline-flex items-center rounded-full bg-blanco px-4 text-sm font-semibold text-negro">
            Seguir a mis textos
          </Link>
          {sub?.plan === "pro" && (
            <span className="tap inline-flex items-center rounded-full border border-ink-600 px-4 text-sm text-ink-300" aria-disabled>
              Mandar a edición · próximamente
            </span>
          )}
        </div>
      )}
    </section>
  );
}
