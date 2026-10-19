"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { submitKeepingState } from "@/lib/form-submit";
import { syncAction, type IgActionState } from "@/lib/instagram/actions";

export function SyncButton() {
  const [state, action, pending] = useActionState<IgActionState, FormData>(syncAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-1">
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending ? "Actualizando…" : "Actualizar ahora"}
      </Button>
      {state?.error && (
        <p role="alert" className="text-xs text-alerta">
          {state.error}
        </p>
      )}
    </form>
  );
}
