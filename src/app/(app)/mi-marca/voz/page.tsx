import type { Metadata } from "next";
import { Card, Chip, FormSuccess, PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { getOverview, getVoice } from "@/lib/brujula/service";
import { VOICE_TOPICS } from "@/lib/brujula/voice";
import { VoiceCapture } from "./VoiceCapture";

export const metadata: Metadata = { title: "Mi voz" };

export default async function VozPage({ searchParams }: PageProps<"/mi-marca/voz">) {
  const { user } = await requireCreatorAccess();
  const params = await searchParams;
  const [voice, overview] = await Promise.all([getVoice(user.id), getOverview(user.id)]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Steps overview={overview} current="voz" />
      <PageHeader eyebrow="Mi marca" title="Tu voz" />
      <p className="text-ink-700">
        Habla 2 o 3 minutos sobre un tema que te mueve. Con eso conocemos tu forma de hablar (vocabulario, muletillas y ritmo) para que tus guiones suenen a ti y no a una máquina.
      </p>
      <FormSuccess message={params.listo ? "¡Listo! Ya tenemos tu perfil de voz." : undefined} />

      {voice && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-extrabold">Tu perfil de voz</p>
            {voice.mock && <Chip tone="naranja">Versión de prueba</Chip>}
          </div>
          <p className="text-sm text-ink-700">{voice.profile.summary}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-ink-500">Ritmo</dt>
              <dd className="font-semibold">{voice.profile.pace.wpm ? `${voice.profile.pace.wpm} palabras/min · ${voice.profile.pace.label}` : voice.profile.pace.label}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Largo de frase</dt>
              <dd className="font-semibold">{voice.profile.sentenceLength} palabras</dd>
            </div>
          </dl>
          {voice.profile.vocabulary.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {voice.profile.vocabulary.map((w) => (
                <Chip key={w} tone="azul">
                  {w}
                </Chip>
              ))}
            </div>
          )}
          {voice.mock && (
            <p className="text-xs text-ink-500">
              Mientras conectamos el servicio de transcripción, las grabaciones usan un texto de ejemplo. Si quieres un perfil con tus palabras reales ya, usa “Prefiero escribir”.
            </p>
          )}
          <p className="text-xs text-ink-500">Tema: {VOICE_TOPICS.find((t) => t.value === voice.topic)?.label}. Tu audio no se guarda: solo conservamos el texto y el perfil.</p>
        </Card>
      )}

      <Card>
        <p className="mb-3 font-extrabold">{voice ? "Hacerlo de nuevo" : "Tu muestra de voz"}</p>
        <VoiceCapture defaultTopic={voice?.topic ?? VOICE_TOPICS[0].value} />
      </Card>
    </div>
  );
}
