import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { ClipUploader } from "@/components/record/RecipeForms";
import { RequestEditButton } from "@/components/record/EditForms";
import { VoiceRecorder } from "@/components/record/VoiceRecorder";
import { Button } from "@/components/ui";
import { listClips } from "@/lib/edit/recipe";
import { moveClipAction, removeClipAction, removeVoiceoverAction } from "@/lib/edit/recipe-actions";
import { MAX_CLIPS } from "@/lib/edit/recipe-schemas";
import { editQuota } from "@/lib/edit/service";
import { VO_MAX_CLIP_SECONDS } from "@/lib/edit/vo-rules";
import { getVoiceover } from "@/lib/edit/voiceover";

/** Voz en off (solo Pro): el creador sube tomas sueltas, graba su voz y la IA acomoda las tomas sobre ella. */
export async function VoiceoverSection({ userId, pieceId, text, again = false }: { userId: string; pieceId: string; text: string; again?: boolean }) {
  const [quota, clips, voice] = await Promise.all([editQuota(userId), listClips(userId, pieceId), getVoiceover(userId, pieceId)]);

  if (!quota.allowed) {
    return (
      <section className="flex flex-col gap-2 rounded-card bg-ink-800 p-4" aria-label="Voz en off">
        <h2 className="font-extrabold">Voz en off con tomas · Pro</h2>
        <p className="text-sm text-ink-300">Subes tus tomas, grabas tu voz y la IA arma el video: pone cada toma donde va con lo que dices, con subtítulos de tu estilo y portada.</p>
        <Link href="/mi-marca" className="tap inline-flex items-center self-start rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
          Conocer el plan Pro
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-card bg-ink-800 p-4" aria-label="Voz en off">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-extrabold">Voz en off con tomas</h2>
        <span className="text-xs text-ink-300">
          {quota.used} de {quota.limit} este mes
        </span>
      </div>
      <p className="text-sm text-ink-300">Sube tus tomas y graba tu voz. La IA escucha tu voz, mira cada toma y las acomoda donde van, con subtítulos de tu estilo, tu gancho en pantalla y una portada. Tú revisas antes de armarlo.</p>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-extrabold">1. Tus tomas</h3>
        <ul className="flex flex-col gap-2">
          {clips.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-700 p-2 text-sm">
              <span>
                Toma {i + 1} · {c.seconds} s
                {c.seconds > VO_MAX_CLIP_SECONDS && <span className="ml-1 text-xs text-naranja">(se usa hasta donde la IA lo necesite)</span>}
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
        <ClipUploader pieceId={pieceId} count={clips.length} max={MAX_CLIPS} voiceOver />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-extrabold">2. Tu voz en off</h3>
        {voice && (
          <div className="flex flex-col gap-2 rounded-xl bg-ink-700 p-3">
            <p className="text-sm font-semibold">Tu voz · {voice.seconds} s</p>
            <audio src={`/api/grabaciones/voz/${pieceId}?t=${voice.createdAt.getTime()}`} controls preload="metadata" className="w-full" />
            <form action={removeVoiceoverAction}>
              <input type="hidden" name="pieza" value={pieceId} />
              <button type="submit" className="tap rounded-full px-3 text-xs font-semibold text-ink-300 underline underline-offset-4">
                Borrar mi voz
              </button>
            </form>
          </div>
        )}
        <VoiceRecorder pieceId={pieceId} text={text} hasVoice={Boolean(voice)} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-extrabold">3. Que la IA lo arme</h3>
        {clips.length > 0 && voice ? <RequestEditButton pieceId={pieceId} modo="voz_en_off" label={again ? "Armar de nuevo la edición" : "Armar mi edición"} /> : <p className="text-xs text-ink-300">Sube al menos una toma y graba tu voz para continuar.</p>}
      </div>
    </section>
  );
}
