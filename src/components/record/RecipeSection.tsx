import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { Poller } from "@/components/metrics/Poller";
import { RecipeAdjustForm, RecipeButton, ClipUploader } from "@/components/record/RecipeForms";
import { Button } from "@/components/ui";
import { isRecipeStuck, listClips, getRecipe, parseRecipe } from "@/lib/edit/recipe";
import { MAX_CLIPS } from "@/lib/edit/recipe-schemas";
import { moveClipAction, removeClipAction } from "@/lib/edit/recipe-actions";
import { MAX_ADJUSTMENTS } from "@/lib/edit/schemas";

/** Modo “tomas sueltas”: la app no edita; la IA arma una receta paso a paso para CapCut. */
export async function RecipeSection({ userId, pieceId, showUploader }: { userId: string; pieceId: string; showUploader: boolean }) {
  const [clips, recipe] = await Promise.all([listClips(userId, pieceId), getRecipe(userId, pieceId)]);
  const working = recipe?.status === "procesando" && !isRecipeStuck(recipe);
  const result = recipe ? parseRecipe(recipe.result) : null;
  const left = recipe ? Math.max(0, MAX_ADJUSTMENTS - recipe.adjustments) : MAX_ADJUSTMENTS;
  const clipName = (id: string | null) => (id ? `toma ${Number(id.replace(/\D/g, "")) || id}` : "");

  return (
    <div className="flex flex-col gap-3">
      {working && <Poller />}
      {showUploader && !recipe && (
        <>
          <p className="text-sm text-ink-300">Sube tus tomas (hasta {MAX_CLIPS}). La IA las mira y te arma una <strong>receta paso a paso para editarlas en CapCut</strong>: qué tomas usar, en qué orden, cuánto dura cada una y qué texto lleva.</p>
          <ul className="flex flex-col gap-2">
            {clips.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-700 p-2 text-sm">
                <span>
                  Toma {i + 1} · {c.seconds} s
                </span>
                <span className="flex items-center gap-1">
                  {(["up", "down"] as const).map((dir) => (
                    <form key={dir} action={moveClipAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="dir" value={dir} />
                      <button type="submit" disabled={dir === "up" ? i === 0 : i === clips.length - 1} aria-label={dir === "up" ? "Subir de lugar" : "Bajar de lugar"} className="tap grid size-9 place-items-center rounded-full border border-ink-600 disabled:opacity-30">
                        {dir === "up" ? <ArrowUp className="size-4" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />}
                      </button>
                    </form>
                  ))}
                  <form action={removeClipAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <Button type="submit" size="sm" variant="ghost" className="text-blanco hover:bg-ink-600">
                      Quitar
                    </Button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
          <ClipUploader pieceId={pieceId} count={clips.length} max={MAX_CLIPS} />
          {clips.length > 0 && <RecipeButton pieceId={pieceId} />}
        </>
      )}

      {working && (
        <p className="text-sm" aria-live="polite">
          Viendo tus tomas y armando la receta… tarda unos minutos. Puedes salir: te avisamos.
        </p>
      )}
      {recipe && (recipe.status === "error" || isRecipeStuck(recipe)) && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-alerta-100">
            {recipe.status === "error" ? `No pudimos armar la receta: ${recipe.error ?? "algo falló"}.` : "La receta está tardando más de lo normal."}
          </p>
          <RecipeButton pieceId={pieceId} label="Reintentar" />
        </div>
      )}

      {recipe?.status === "lista" && result && (
        <div className="flex flex-col gap-3">
          {recipe.mock && <p className="rounded-lg bg-naranja-100 p-3 text-xs text-ink-900">Es una receta de ejemplo hecha con reglas (sin IA): con la IA activa elige las mejores tomas y su orden.</p>}
          <p className="text-sm font-semibold">{result.idea}</p>
          <p className="text-xs text-ink-300">Duración sugerida: unos {result.duracion_sugerida_s} s</p>
          <ol className="flex flex-col gap-2">
            {result.pasos.map((p) => (
              <li key={p.numero} className="rounded-xl bg-ink-700 p-3 text-sm">
                <p>
                  <strong>{p.numero}.</strong> {p.accion}
                </p>
                {p.clip_id && (
                  <p className="text-xs text-ink-300">
                    {clipName(p.clip_id)} · de {p.desde_s} s a {p.hasta_s} s
                  </p>
                )}
                {p.texto_pantalla && <p className="mt-1 text-xs">Texto en pantalla: “{p.texto_pantalla}”</p>}
              </li>
            ))}
          </ol>
          {result.clips_descartados.length > 0 && (
            <div className="text-xs text-ink-300">
              <p className="font-semibold">No usé:</p>
              <ul className="list-disc pl-5">
                {result.clips_descartados.map((c, i) => (
                  <li key={i}>
                    {clipName(c.clip_id)}: {c.porque}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-xl bg-ink-700 p-3 text-sm">
            <p className="font-semibold">Estilo de tus textos</p>
            <p className="text-xs text-ink-300">
              Fuente: {result.estilo_textos.fuente} · texto {result.estilo_textos.color_texto} · detalle {result.estilo_textos.color_detalle}
            </p>
            <a href={`/api/kit/fuente/${encodeURIComponent(result.estilo_textos.fuente)}`} className="mt-2 inline-flex text-xs font-semibold text-azul-100 underline underline-offset-4">
              Descargar la fuente para importarla en CapCut
            </a>
          </div>
          {result.subtitulos && <p className="text-sm">💬 {result.subtitulos}</p>}
          {result.sugerencia_audio && <p className="text-xs text-ink-300">🎵 {result.sugerencia_audio} (la app no pone música.)</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/semana/${pieceId}`} className="tap inline-flex items-center rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
              Ya lo edité, a mis textos
            </Link>
          </div>
          {left > 0 && <RecipeAdjustForm pieceId={pieceId} left={left} />}
        </div>
      )}
    </div>
  );
}
