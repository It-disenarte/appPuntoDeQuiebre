"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { resetToursAction } from "@/lib/tour/actions";

/** Vuelve a mostrar todas las guías y regresa a Hoy, donde empiezan. */
export function ResetToursButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await resetToursAction();
        router.push("/hoy");
        router.refresh();
      }}
    >
      {busy ? "Un momento…" : "Ver las guías otra vez"}
    </Button>
  );
}
