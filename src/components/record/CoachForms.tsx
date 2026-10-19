"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { requestReviewAction, type CoachActionState } from "@/lib/coach/actions";
import { submitKeepingState } from "@/lib/form-submit";

export function RequestReviewForm({ pieceId, label }: { pieceId: string; label: string }) {
  const [state, action, pending] = useActionState<CoachActionState, FormData>(requestReviewAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-2">
      <input type="hidden" name="pieza" value={pieceId} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Enviando…" : label}
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-alerta-100">
          {state.error}
        </p>
      )}
    </form>
  );
}
