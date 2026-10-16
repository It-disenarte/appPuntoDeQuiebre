import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui";
import type { BrujulaOverview } from "@/lib/brujula/service";

type StepId = "historia" | "brujula" | "kit" | "voz" | "horario";

/** Los 4 pasos del alta, con su estado. Cada paso se puede abrir en cualquier momento. */
export function Steps({ overview, current }: { overview: BrujulaOverview; current: StepId }) {
  const steps: { id: StepId; label: string; href: string; done: boolean }[] = [
    { id: "historia", label: "Tu historia", href: "/mi-marca/historia", done: overview.story.ready },
    { id: "brujula", label: "Brújula", href: "/mi-marca/manual", done: overview.manualApproved },
    { id: "kit", label: "Kit", href: "/mi-marca/kit", done: overview.kitApproved },
    { id: "voz", label: "Voz", href: "/mi-marca/voz", done: overview.hasVoiceProfile },
    { id: "horario", label: "Horario", href: "/mi-marca/horario", done: overview.scheduleAccepted },
  ];
  return (
    <nav aria-label="Pasos de tu alta">
      <ol className="grid grid-cols-5 gap-1">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Link
              href={s.href}
              aria-current={s.id === current ? "step" : undefined}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center text-xs font-semibold",
                s.id === current ? "bg-azul-50 text-azul" : "text-ink-600 hover:bg-ink-200/60",
              )}
            >
              <span className={cn("grid size-7 place-items-center rounded-full text-xs font-extrabold", s.done ? "bg-exito text-blanco" : s.id === current ? "bg-azul text-blanco" : "bg-ink-200 text-ink-700")}>
                {s.done ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              {s.label}
              {s.done && <span className="sr-only"> (completado)</span>}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
