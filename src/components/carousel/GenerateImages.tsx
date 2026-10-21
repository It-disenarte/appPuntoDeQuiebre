"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { generateAllImagesAction, type CarouselActionState } from "@/lib/carousel/actions";

/** “Crear con IA las imágenes que faltan”: el worker las dibuja una por una y las coloca solas. */
export function GenerateAllImages({ id, missing, left }: { id: string; missing: number; left: number }) {
  const [state, action, pending] = useActionState<CarouselActionState, FormData>(generateAllImagesAction, undefined);
  const will = Math.min(missing, left);
  return (
    <form action={action} className="flex flex-col gap-2">
      {pending && <LoadingOverlay title="Pidiendo tus imágenes…" hint="Un momento." />}
      <input type="hidden" name="id" value={id} />
      <Button type="submit" disabled={pending || left <= 0} className="self-start">
        {left <= 0 ? "Sin imágenes con IA este mes" : `Crear con IA ${will === missing ? (missing === 1 ? "la imagen que falta" : `las ${missing} imágenes que faltan`) : `${will} de las ${missing} imágenes que faltan`}`}
      </Button>
      <p className="text-xs text-ink-600">Te quedan {left} imágenes con IA este mes. Se colocan solas en cada slide; si alguna no te gusta, la rehaces o subes tu foto.</p>
      {state?.error && (
        <p role="alert" className="text-xs text-alerta">
          {state.error}
        </p>
      )}
    </form>
  );
}
