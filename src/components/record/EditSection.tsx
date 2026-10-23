import Link from "next/link";
import { Poller } from "@/components/metrics/Poller";
import { AdjustForm, DiscardEditButton, RenderButton, RequestEditButton, TextEditor } from "@/components/record/EditForms";
import { Button } from "@/components/ui";
import { answerDoubtAction, toggleCutAction } from "@/lib/edit/actions";
import { CUT_LABEL, MAX_ADJUSTMENTS, MAX_FINAL_SECONDS } from "@/lib/edit/schemas";
import { checkEdit, editQuota, getEdit, isStuck, parseOverrides, parsePlan } from "@/lib/edit/service";
import { getRecipe } from "@/lib/edit/recipe";
import { RecipeSection } from "@/components/record/RecipeSection";
import { getExport } from "@/lib/recording/join";
import { shownError } from "@/lib/shown-error";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Edición automática (solo Pro, skill 13 modo “a cámara”): plan de la IA, revisión del creador y video editado. */
export async function EditSection({ userId, pieceId, mode }: { userId: string; pieceId: string; mode?: string }) {
  const [edit, quota, exp, recipe] = await Promise.all([getEdit(userId, pieceId), editQuota(userId), getExport(userId, pieceId), getRecipe(userId, pieceId)]);
  const modo = mode === "camara" || mode === "tomas" || mode === "mixto" || mode === "vozenoff" ? mode : null;
  const base = `/grabar?pieza=${pieceId}`;
  const working = edit && (edit.status === "planeando" || edit.status === "renderizando") && !isStuck(edit);
  const plan = edit ? parsePlan(edit.plan) : null;
  const overrides = edit ? parseOverrides(edit.overrides) : null;
  const check = edit ? checkEdit(edit) : null;
  const left = edit ? Math.max(0, MAX_ADJUSTMENTS - edit.adjustments) : MAX_ADJUSTMENTS;

  if (!quota.allowed) {
    return (
      <section className="flex flex-col gap-2 rounded-card bg-ink-800 p-4" id="edicion" aria-label="Edición automática">
        <h2 className="font-extrabold">Edición automática · Pro</h2>
        <p className="text-sm text-ink-300">En el plan Pro cortamos silencios y muletillas, ponemos subtítulos con tu estilo, acercamientos y el gancho en pantalla, y te damos una portada. Hasta {quota.limit} videos al mes.</p>
        <Link href="/mi-marca" className="tap inline-flex items-center self-start rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
          Conocer el plan Pro
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-card bg-ink-800 p-4" id="edicion" aria-label="Edición automática">
      {working && <Poller />}
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-extrabold">Edición automática</h2>
        <span className="text-xs text-ink-300">
          {quota.used} de {quota.limit} este mes
        </span>
      </div>

      {!edit && !recipe && modo === null && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-300">¿Cómo grabaste este video?</p>
          {[
            ["camara", "Hablo a cámara", "La app lo edita sola: cortes, subtítulos, acercamientos y portada."],
            ["tomas", "Son tomas sueltas", "Vlog, proceso o tendencia sin voz: te armamos una receta paso a paso para CapCut."],
            ["mixto", "Las dos cosas", "Hablo y además hay tomas (detrás de cámaras): la app lo edita sola con apoyos."],
            ["vozenoff", "Voz en off con tomas", "Subes tus tomas y grabas tu voz: la IA acomoda cada toma donde va y lo edita."],
          ].map(([id, title, text]) => (
            <Link key={id} href={`${base}&modo=${id}`} className="rounded-xl bg-ink-700 p-3 hover:bg-ink-600">
              <span className="block text-sm font-extrabold">{title}</span>
              <span className="block text-xs text-ink-300">{text}</span>
            </Link>
          ))}
        </div>
      )}

      {!edit && !recipe && modo !== null && (
        <Link href={base} className="self-start text-xs font-semibold text-azul-100 underline underline-offset-4">
          ← Cambiar la forma de editar
        </Link>
      )}

      {!edit && !recipe && modo === "camara" && (
        <>
          <p className="text-sm text-ink-300">Quitamos silencios y muletillas, ponemos subtítulos con tu kit, acercamientos y tu gancho en pantalla (máximo {MAX_FINAL_SECONDS} s). Tú revisas antes de armarlo.</p>
          {exp?.status === "lista" ? <RequestEditButton pieceId={pieceId} modo="a_camara" /> : <p className="text-xs text-ink-300">Primero arma tu video completo (arriba) y aquí podrás mandarlo a edición.</p>}
        </>
      )}

      {!edit && !recipe && modo === "mixto" && (
        <>
          <p className="text-sm text-ink-300">Para videos donde hablas y además hay tomas (detrás de cámaras). La IA ve tu video y: pone al inicio tu frase más fuerte si no empiezas con gancho, acomoda las tomas sin voz como apoyo de 1 a 3 s, quita pláticas con otras personas y difumina nombres, mensajes o números que se vean (máximo {MAX_FINAL_SECONDS} s).</p>
          {exp?.status === "lista" ? <RequestEditButton pieceId={pieceId} modo="mixto" /> : <p className="text-xs text-ink-300">Primero arma tu video completo (arriba) y aquí podrás mandarlo a edición.</p>}
        </>
      )}

      {!edit && (recipe || modo === "tomas") && <RecipeSection userId={userId} pieceId={pieceId} showUploader={!recipe} />}

      {working && (
        <p className="text-sm" aria-live="polite">
          {edit.status === "planeando" ? (edit.mode === "voz_en_off" ? "Escuchando tu voz y viendo tus tomas…" : "Escuchando tu video y armando el plan de edición…") : "Armando tu video editado…"} Tarda unos minutos. Puedes salir: te avisamos.
        </p>
      )}

      {edit && (edit.status === "error" || isStuck(edit)) && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-alerta-100">
            {edit.status === "error" ? `No pudimos editarlo: ${await shownError(userId, edit.error, "algo falló")}` : "La edición está tardando más de lo normal."}
          </p>
          <p className="text-xs text-ink-300">Forma de edición: {edit.mode === "voz_en_off" ? "voz en off con tomas" : edit.mode === "mixto" ? "hablo y hay tomas" : "hablo a cámara"}.</p>
          <RequestEditButton pieceId={pieceId} label="Reintentar" modo={edit.mode} />
          <DiscardEditButton pieceId={pieceId} />
        </div>
      )}

      {edit?.status === "revision" && plan && overrides && check && (
        <div className="flex flex-col gap-4">
          {edit.mock && <p className="rounded-lg bg-naranja-100 p-3 text-xs text-ink-900">Es una edición de ejemplo hecha con reglas (sin IA o sin voz real): con la IA activa respeta tu voz y tu marca.</p>}
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-semibold">Esto hicimos:</p>
            <ul className="list-disc pl-5">
              {plan.resumen.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <p className="text-xs text-ink-300">El video quedaría de {Math.round(check.finalSeconds)} s.</p>
            {check.warnings.map((w) => (
              <p key={w.code} role="alert" className="text-xs text-naranja">
                {w.text}
              </p>
            ))}
          </div>

          {plan.dudas_transcripcion.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl bg-ink-700 p-3">
              <p className="text-sm font-semibold">¿Dijiste esto? Elige lo correcto para los subtítulos</p>
              {plan.dudas_transcripcion.map((d, i) => (
                <form key={i} action={answerDoubtAction} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="pieza" value={pieceId} />
                  <input type="hidden" name="i" value={i} />
                  <span className="text-xs text-ink-300">{clock(d.segundo)}</span>
                  {(["escuche", "propuesta"] as const).map((c) => (
                    <Button key={c} type="submit" name="eleccion" value={c} size="sm" variant={overrides.doubts[String(i)] === c ? "light" : "ghost"} className={overrides.doubts[String(i)] === c ? "" : "text-blanco"} aria-pressed={overrides.doubts[String(i)] === c}>
                      {c === "escuche" ? d.escuche : d.propuesta}
                    </Button>
                  ))}
                </form>
              ))}
            </div>
          )}

          {plan.modo === "mixto" && (
            <details className="rounded-xl bg-ink-700 p-3" open>
              <summary className="cursor-pointer text-sm font-semibold">Así quedó el orden de tu video</summary>
              <ol className="mt-2 flex flex-col gap-1 text-sm">
                {plan.linea_de_tiempo.map((l) => (
                  <li key={l.tramo}>
                    {l.tramo}. {l.tipo === "gancho_prestado" ? "Tu frase más fuerte, al inicio" : l.tipo === "apoyo" ? "Toma de apoyo (sin sonido)" : "Tú hablando"} <span className="text-xs text-ink-300">· {clock(l.inicio_s)}–{clock(l.fin_s)}{l.que_se_ve ? ` · ${l.que_se_ve}` : ""}</span>
                  </li>
                ))}
              </ol>
              {plan.privacidad.length > 0 && (
                <div className="mt-3 text-sm">
                  <p className="font-semibold">Por privacidad:</p>
                  <ul className="list-disc pl-5">
                    {plan.privacidad.map((p, i) => (
                      <li key={i}>
                        {p.accion === "difuminar" ? "Difuminé" : "Corté"} {clock(p.inicio_s)}–{clock(p.fin_s)}
                        {p.porque ? ` · ${p.porque}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-2 text-xs text-ink-300">En el modo mixto los cortes se cambian con «Pedir un cambio».</p>
            </details>
          )}

          {plan.modo === "voz_en_off" && (
            <details className="rounded-xl bg-ink-700 p-3" open>
              <summary className="cursor-pointer text-sm font-semibold">Así acomodé tus tomas</summary>
              <ol className="mt-2 flex flex-col gap-1 text-sm">
                {plan.tramos_voz.map((t, i) => (
                  <li key={i}>
                    {clock(t.inicio_s)}–{clock(t.fin_s)} · Toma {t.clip}
                    <span className="text-xs text-ink-300">{t.frase ? ` · “${t.frase}”` : ""}{t.que_se_ve ? ` · ${t.que_se_ve}` : ""}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-ink-300">Para cambiar qué toma va dónde, usa «Pedir un cambio».</p>
            </details>
          )}

          {plan.modo !== "mixto" && plan.modo !== "voz_en_off" && (
          <details className="rounded-xl bg-ink-700 p-3">
            <summary className="cursor-pointer text-sm font-semibold">Ver lo que quité ({plan.cortes.length})</summary>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {plan.cortes.length === 0 && <li className="text-ink-300">No quité nada.</li>}
              {plan.cortes.map((c, i) => {
                const restored = overrides.restored.includes(i);
                return (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                    <span className={restored ? "text-ink-300 line-through" : ""}>
                      {clock(c.inicio_s)}–{clock(c.fin_s)} · {CUT_LABEL[c.motivo]}
                      {c.texto ? ` — “${c.texto}”` : ""}
                    </span>
                    <form action={toggleCutAction}>
                      <input type="hidden" name="pieza" value={pieceId} />
                      <input type="hidden" name="i" value={i} />
                      <Button type="submit" size="sm" variant="ghost" className="text-blanco hover:bg-ink-600">
                        {restored ? "Volver a quitar" : "Restaurar"}
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </details>
          )}

          <details className="rounded-xl bg-ink-700 p-3">
            <summary className="cursor-pointer text-sm font-semibold">Textos en pantalla y subtítulos</summary>
            <div className="mt-2 flex flex-col gap-3">
              {plan.textos_pantalla.map((t, i) => (
                <div key={`t${i}`} className="flex flex-col gap-1">
                  <span className="text-xs text-ink-300">
                    {t.tipo === "gancho" ? "Gancho" : t.tipo === "cta" ? "Llamada a la acción" : "Sección"} · {clock(t.inicio_s)}
                  </span>
                  <TextEditor pieceId={pieceId} index={i} initial={overrides.titles[String(i)] ?? t.texto} kind="titulo" />
                </div>
              ))}
              {plan.subtitulos.lineas.slice(0, 40).map((l, i) => (
                <div key={`s${i}`} className="flex flex-col gap-1">
                  <span className="text-xs text-ink-300">Subtítulo · {clock(l.inicio_s)}</span>
                  <TextEditor pieceId={pieceId} index={i} initial={overrides.subtitles[String(i)] ?? l.texto} kind="subtitulo" />
                </div>
              ))}
              {plan.subtitulos.lineas.length > 40 && <p className="text-xs text-ink-300">Se muestran los primeros 40 subtítulos.</p>}
            </div>
          </details>

          {plan.sugerencia_audio && <p className="text-xs text-ink-300">🎵 {plan.sugerencia_audio} (no ponemos música: la agregas al publicar.)</p>}
          <div className="flex flex-wrap items-start gap-3">
            <RenderButton pieceId={pieceId} />
          </div>
          {left > 0 && <AdjustForm pieceId={pieceId} left={left} />}
        </div>
      )}

      {edit?.status === "lista" && (
        <div className="flex flex-col gap-3">
          {edit.mock && <p className="rounded-lg bg-naranja-100 p-3 text-xs text-ink-900">Edición de ejemplo hecha con reglas.</p>}
          <video src={`/api/grabaciones/editado/${pieceId}`} controls playsInline preload="metadata" className="mx-auto aspect-9/16 max-h-[60dvh] w-auto max-w-full rounded-lg bg-negro" />
          <p className="text-xs text-ink-300">{edit.outputSeconds ?? 0} s · listo para publicar</p>
          <div className="flex flex-wrap items-center gap-3">
            <a href={`/api/grabaciones/editado/${pieceId}?descargar=1`} className="tap inline-flex items-center rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
              Descargar video editado
            </a>
            {edit.coverKey && (
              <a href={`/api/grabaciones/editado/${pieceId}?que=portada&descargar=1`} className="tap inline-flex items-center rounded-full border border-ink-600 px-5 text-sm font-semibold">
                Descargar portada
              </a>
            )}
            <Link href={`/semana/${pieceId}`} className="tap inline-flex items-center rounded-full border border-ink-600 px-5 text-sm font-semibold">
              Seguir a mis textos
            </Link>
          </div>
          {edit.coverKey && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/grabaciones/editado/${pieceId}?que=portada&t=${edit.updatedAt.getTime()}`} alt="Portada del reel" className="mx-auto h-40 w-auto rounded-lg" />
          )}
          {left > 0 && <AdjustForm pieceId={pieceId} left={left} />}
        </div>
      )}
    </section>
  );
}
