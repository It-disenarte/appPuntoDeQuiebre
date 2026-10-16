import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { getStep, STORY_STEPS } from "@/lib/brujula/content";
import { getIntake, getOverview } from "@/lib/brujula/service";
import { SellForm } from "./SellForm";
import { StepCapture } from "./StepCapture";

export const metadata: Metadata = { title: "Tu historia" };

export default async function PasoPage({ params }: PageProps<"/mi-marca/historia/[paso]">) {
  const { paso } = await params;
  const step = getStep(paso);
  if (!step) notFound();
  const { user } = await requireCreatorAccess();
  const [intake, overview] = await Promise.all([getIntake(user.id), getOverview(user.id)]);
  const story = intake?.story ?? { steps: {} };
  const answer = story.steps[step.id];
  const initialText = answer && !answer.skipped ? answer.text : "";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Steps overview={overview} current="historia" />
      <PageHeader eyebrow={`Pregunta ${step.n} de ${STORY_STEPS.length}`} title={step.title} />
      <Card className="flex flex-col gap-5">
        <p className="text-lg font-semibold">{step.question}</p>
        <p className="text-sm text-ink-500">No tienes que contar nada que no quieras.</p>
        {step.kind === "venta" ? (
          <SellForm initialMode={story.sell?.mode ?? ""} initialText={story.sell?.text ?? ""} />
        ) : (
          <StepCapture step={{ id: step.id, minSeconds: step.minSeconds, minWords: step.minWords, followUp: step.followUp }} initialText={initialText} initialChoice={story.storyChoice ?? ""} />
        )}
      </Card>
      <Link href="/mi-marca/historia" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
        Ver todas las preguntas
      </Link>
    </div>
  );
}
