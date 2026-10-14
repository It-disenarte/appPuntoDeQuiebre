import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { hasAcceptedCommitment, requirePaidUser } from "@/lib/auth/gates";
import { COMMITMENT_QUESTIONS, COMMITMENT_SLIDES } from "@/lib/commitment";
import { getSetting, SETTING_KEYS, type WelcomeVideo } from "@/lib/settings";
import { CommitmentForm } from "./CommitmentForm";

export const metadata: Metadata = { title: "Bienvenida" };

export default async function BienvenidaPage() {
  const { user } = await requirePaidUser();
  if (user.role !== "admin" && (await hasAcceptedCommitment(user.id))) redirect("/hoy");
  const video = await getSetting<WelcomeVideo>(SETTING_KEYS.welcomeVideo);

  // Solo se mandan al cliente las preguntas y opciones, nunca las respuestas correctas.
  const questions = COMMITMENT_QUESTIONS.map((q) => ({ id: q.id, question: q.question, options: q.options.map((o) => ({ ...o })) }));
  const hints = Object.fromEntries(COMMITMENT_QUESTIONS.map((q) => [q.id, q.hint]));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader eyebrow={`Bienvenida, ${user.name.split(" ")[0]}`} title="Antes de empezar" />

      <section className="overflow-hidden rounded-card bg-negro">
        {video ? (
          <video controls playsInline preload="metadata" className="aspect-video w-full bg-negro" src="/api/media/bienvenida">
            Tu navegador no puede reproducir este video.
          </video>
        ) : (
          <div className="grid aspect-video place-items-center p-6 text-center text-ink-300">
            <p>Aquí va el video de presentación de Erick.</p>
          </div>
        )}
      </section>

      <ol className="flex flex-col gap-3">
        {COMMITMENT_SLIDES.map((s, i) => (
          <li key={s.title}>
            <Card className="flex gap-4">
              <span className="font-display text-3xl text-azul" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="font-extrabold">{s.title}</h2>
                <p className="mt-1 text-sm text-ink-600">{s.body}</p>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <CommitmentForm questions={questions} hints={hints} />
    </div>
  );
}
