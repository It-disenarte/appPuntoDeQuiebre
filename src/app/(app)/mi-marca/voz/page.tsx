import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ButtonLink, Card, Chip, PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { getOverview, getVoiceProfile } from "@/lib/brujula/service";

export const metadata: Metadata = { title: "Mi perfil de voz" };

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-xs text-ink-500">{label}</dt>
    <dd className="text-sm text-ink-900">{children}</dd>
  </div>
);
const Pills = ({ items }: { items: string[] }) => (
  <div className="flex flex-wrap gap-2">
    {items.map((x, i) => (
      <Chip key={`${x}-${i}`} tone="azul">
        {x}
      </Chip>
    ))}
  </div>
);

const FORMALITY = ["", "Muy casual", "Casual", "Intermedio", "Formal", "Muy formal"];

export default async function VozPage() {
  const { user } = await requireCreatorAccess();
  const [profile, overview] = await Promise.all([getVoiceProfile(user.id), getOverview(user.id)]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Steps overview={overview} current="voz" />
      <PageHeader eyebrow="Mi marca" title="Tu perfil de voz" />
      <p className="text-ink-700">Describe cómo hablas, para que todo lo que escribe la app suene a ti y no a una máquina. Se arma con tu historia.</p>

      {!profile ? (
        <Card>
          <p className="font-extrabold">Todavía no tienes perfil de voz</p>
          <p className="mt-1 text-sm text-ink-600">Se genera junto con tu brújula, cuando terminas tu historia y tus elecciones rápidas.</p>
          <ButtonLink href={overview.next?.href ?? "/mi-marca/historia"} className="mt-4" size="sm">
            {overview.next?.text ?? "Ir a mi historia"}
          </ButtonLink>
        </Card>
      ) : (
        <>
          {profile.mock && (
            <p className="rounded-xl bg-naranja-100 p-4 text-sm text-ink-900">
              <strong>Versión de prueba.</strong> Se calculó con reglas sobre tus respuestas (y, si grabaste, con un texto de ejemplo en lugar de la transcripción real). El perfil real lo hace la IA.
            </p>
          )}
          <Card className="flex flex-col gap-4">
            <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Row label="Formalidad">
                {FORMALITY[profile.content.formalidad]} ({profile.content.formalidad} de 5)
              </Row>
              <Row label="Energía">{profile.content.energia}</Row>
              <Row label="Ritmo">{profile.content.ritmo}</Row>
              <Row label="Cómo aconsejas">{profile.content.como_aconseja}</Row>
              <Row label="Humor">{profile.content.humor}</Row>
            </dl>
            <dl className="flex flex-col gap-4">
              <Row label="Cómo armas una idea">
                <ol className="list-decimal pl-5">{profile.content.estructura_tipica.map((x, i) => <li key={`${x}-${i}`}>{x}</li>)}</ol>
              </Row>
              {profile.content.palabras_frecuentes.length > 0 && (
                <Row label="Palabras que más usas">
                  <Pills items={profile.content.palabras_frecuentes} />
                </Row>
              )}
              {profile.content.muletillas.length > 0 && (
                <Row label="Muletillas">
                  <ul className="list-disc pl-5">
                    {profile.content.muletillas.map((m) => (
                      <li key={m.texto}>
                        <strong>{m.texto}</strong> · {m.uso}
                      </li>
                    ))}
                  </ul>
                </Row>
              )}
              {profile.content.frases_firma.length > 0 && (
                <Row label="Frases firma">
                  <Pills items={profile.content.frases_firma} />
                </Row>
              )}
              <Row label="Recursos que usas">
                <ul className="list-disc pl-5">{profile.content.recursos.map((x, i) => <li key={`${x}-${i}`}>{x}</li>)}</ul>
              </Row>
              <Row label="Evitamos en tus guiones">
                <ul className="list-disc pl-5">{profile.content.evitar.map((x, i) => <li key={`${x}-${i}`}>{x}</li>)}</ul>
              </Row>
            </dl>
          </Card>

          <Card className="flex flex-col gap-2">
            <h2 className="text-sm font-extrabold">Así sonaría en tu voz</h2>
            <p className="text-sm text-ink-500">Genérico: {profile.content.ejemplo.generico}</p>
            <p className="rounded-xl bg-azul-50 p-4 text-sm text-ink-900">En tu voz: {profile.content.ejemplo.en_su_voz}</p>
          </Card>

          <Card>
            <h2 className="text-sm font-extrabold">Reglas para tus guiones</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-ink-700">{profile.content.reglas_para_guiones.map((x, i) => <li key={`${x}-${i}`}>{x}</li>)}</ul>
            <p className="mt-3 text-xs text-ink-500">La prueba de voz (3 guiones cortos para calificar) llega con la generación de guiones.</p>
          </Card>
        </>
      )}
    </div>
  );
}
