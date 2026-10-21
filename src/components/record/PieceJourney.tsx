import { cn } from "@/components/ui";

export type JourneyStep = { id: string; label: string; href: string; state: "done" | "current" | "todo" };

/** Los pasos de un video, de un vistazo: grabar → unir → editar → publicar. Cada uno lleva a su sección. */
export function PieceJourney({ steps }: { steps: JourneyStep[] }) {
  return (
    <nav aria-label="Avance de tu video">
      <ol className="grid grid-cols-4 gap-1.5">
        {steps.map((s, i) => (
          <li key={s.id}>
            <a href={s.href} aria-current={s.state === "current" ? "step" : undefined} className="flex flex-col items-center gap-1.5 text-center">
              <span className={cn("h-1.5 w-full rounded-full", s.state === "done" ? "bg-exito" : s.state === "current" ? "bg-naranja" : "bg-ink-700")} />
              <span className="flex items-center gap-1.5">
                <span className={cn("grid size-5 place-items-center rounded-full text-[0.6875rem] font-extrabold", s.state === "done" ? "bg-exito text-negro" : s.state === "current" ? "bg-naranja text-negro" : "bg-ink-700 text-ink-300")}>{s.state === "done" ? "✓" : i + 1}</span>
                <span className={cn("text-xs", s.state === "current" ? "font-extrabold text-blanco" : s.state === "done" ? "font-semibold text-ink-100" : "text-ink-400")}>{s.label}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
