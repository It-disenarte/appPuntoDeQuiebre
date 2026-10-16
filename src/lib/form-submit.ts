"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Envía el formulario a una acción de servidor SIN que React 19 lo reinicie después (con `action={fn}` un formulario
 * que falla se vacía y desmarca lo que el usuario eligió). Úsalo como `onSubmit={submitKeepingState(action)}`.
 */
export function submitKeepingState(action: (formData: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => action(fd));
  };
}
