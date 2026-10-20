"use client";

import { useEffect, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";

export function Spinner({ className = "size-12" }: { className?: string }) {
  return <span className={`${className} inline-block animate-spin rounded-full border-4 border-ink-200 border-t-azul`} role="presentation" />;
}

/** Segundos desde que arrancó la espera (para decir “llevamos 25 s” y que no parezca que se trabó). */
export function useElapsed(since?: number) {
  const [start] = useState(() => since ?? Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.floor((now - start) / 1000));
}

function Body({ title, hint }: { title: string; hint: string }) {
  const s = useElapsed();
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-negro/75 p-6" role="status" aria-live="polite">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-card bg-blanco p-7 text-center shadow-card">
        <Spinner />
        <p className="font-display text-2xl">{title}</p>
        <p className="text-sm text-ink-700">{hint}</p>
        {s >= 10 && <p className="text-xs text-ink-500">Sigue trabajando… {s} s. No cierres la app.</p>}
      </div>
    </div>
  );
}

/**
 * Pantalla de espera a pantalla completa. Se muestra en cuanto empieza una acción lenta, para que no parezca que la app se trabó.
 * Úsala dentro del botón: `{pending && <LoadingOverlay title="Armando tu semana…" />}`.
 */
export function LoadingOverlay({ title, hint = "Esto puede tardar hasta un minuto." }: { title: string; hint?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []); // eslint-disable-line react-hooks/set-state-in-effect
  if (!mounted) return null;
  return createPortal(<Body title={title.replace(/\s*\(.*\)\s*$/, "")} hint={hint} />, document.body);
}

/** Dentro de un <form action={…}>: muestra la pantalla de espera mientras se envía. */
export function PendingOverlay({ title, hint }: { title: string; hint?: string }) {
  const { pending } = useFormStatus();
  return pending ? <LoadingOverlay title={title} hint={hint} /> : null;
}
