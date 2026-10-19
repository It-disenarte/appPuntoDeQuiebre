"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { runAuditAction, type AuditActionState } from "@/lib/audit-account/actions";
import { submitKeepingState } from "@/lib/form-submit";

export function AuditButton({ again }: { again?: boolean }) {
  const [state, action, pending] = useActionState<AuditActionState, FormData>(runAuditAction, undefined);
  return (
    <form onSubmit={submitKeepingState(action)} className="flex flex-col gap-1">
      <Button type="submit" variant={again ? "outline" : "primary"} disabled={pending} className="self-start">
        {pending ? "Revisando tu cuenta… (hasta un minuto)" : again ? "Volver a revisar mi cuenta" : "Revisar mi cuenta"}
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-alerta">
          {state.error}
        </p>
      )}
    </form>
  );
}
