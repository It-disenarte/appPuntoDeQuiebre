"use client";

import { useEffect } from "react";
import { Isotipo } from "@/components/brand/Logo";
import { Button, ButtonLink } from "@/components/ui";

/**
 * Pantalla amable cuando algo falla al mostrar una página. No enseña detalles técnicos (podrían filtrar datos): solo un
 * código corto (`digest`) para que el equipo lo busque en los registros del servidor.
 */
export function ErrorScreen({ error, retry, compact = false }: { error: Error & { digest?: string }; retry: () => void; compact?: boolean }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className={compact ? "flex flex-col items-center gap-4 px-6 py-16 text-center" : "flex min-h-dvh flex-col items-center justify-center gap-5 bg-ink-100 px-8 text-center"}>
      <Isotipo surface="blanco" className="h-20" />
      <h1 className="font-display text-3xl">Estamos teniendo algunos problemas</h1>
      <p className="max-w-md text-ink-600">Algo no salió como esperábamos, pero tu información está a salvo. Intenta de nuevo en un momento; si sigue pasando, avísanos.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={() => retry()}>
          Intentar de nuevo
        </Button>
        <ButtonLink href="/hoy" variant="outline">
          Ir a Hoy
        </ButtonLink>
      </div>
      {error.digest && <p className="text-xs text-ink-400">Código para soporte: {error.digest}</p>}
    </div>
  );
}
