"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { saveIdeaAction, videoFromIdeaAction, type IdeaActionState } from "@/lib/ideas/actions";

type Idea = { titulo: string; gancho: string; idea: string; guion: string | null; creador: string };

function Hidden({ idea }: { idea: Idea }) {
  return (
    <>
      <input type="hidden" name="titulo" value={idea.titulo} />
      <input type="hidden" name="gancho" value={idea.gancho} />
      <input type="hidden" name="idea" value={idea.idea} />
      <input type="hidden" name="guion" value={idea.guion ?? ""} />
      <input type="hidden" name="creador" value={idea.creador} />
    </>
  );
}

/** Qué hacer con una idea nueva del análisis: guardarla en el banco, volverla video de la semana o carrusel. */
export function IdeaActions({ idea, saved }: { idea: Idea; saved: boolean }) {
  const [save, saveAction, saving] = useActionState<IdeaActionState, FormData>(saveIdeaAction, undefined);
  const [video, videoAction, making] = useActionState<IdeaActionState, FormData>(videoFromIdeaAction, undefined);
  const isSaved = saved || Boolean(save?.ok);
  return (
    <div className="mt-3 flex flex-col gap-2">
      {making && <LoadingOverlay title="Pidiendo tu guion…" hint="Un momento." />}
      <div className="flex flex-wrap gap-2">
        <form action={videoAction}>
          <Hidden idea={idea} />
          <Button type="submit" size="sm" disabled={making || Boolean(video?.ok)}>
            Hacer un video con esta idea
          </Button>
        </form>
        <ButtonLink href={`/carruseles?tema=${encodeURIComponent(idea.titulo)}`} variant="outline" size="sm">
          Hacer un carrusel
        </ButtonLink>
        <form action={saveAction}>
          <Hidden idea={idea} />
          <Button type="submit" size="sm" variant="ghost" disabled={saving || isSaved}>
            {isSaved ? "Guardada ✓" : "Guardar en mi banco"}
          </Button>
        </form>
      </div>
      {video?.ok && (
        <p role="status" className="text-xs text-ink-700">
          {video.message} <Link href="/semana" className="font-semibold text-azul underline underline-offset-4">Ver mi semana</Link>
        </p>
      )}
      {(video?.error || save?.error) && (
        <p role="alert" className="text-xs text-alerta">
          {video?.error ?? save?.error}
        </p>
      )}
      {save?.ok && <p className="text-xs text-ink-600">{save.message}</p>}
    </div>
  );
}

/** Botón de una idea ya guardada en el banco. */
export function BankVideoButton({ ideaId }: { ideaId: string }) {
  const [state, action, pending] = useActionState<IdeaActionState, FormData>(videoFromIdeaAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-1">
      {pending && <LoadingOverlay title="Pidiendo tu guion…" hint="Un momento." />}
      <input type="hidden" name="ideaId" value={ideaId} />
      <Button type="submit" size="sm" disabled={pending || Boolean(state?.ok)}>
        {state?.ok ? "Guion en camino ✓" : "Hacer video"}
      </Button>
      {state?.error && (
        <p role="alert" className="text-xs text-alerta">
          {state.error}
        </p>
      )}
    </form>
  );
}
