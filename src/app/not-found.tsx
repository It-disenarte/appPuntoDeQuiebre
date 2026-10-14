import { Isotipo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ink-100 px-8 text-center">
      <Isotipo surface="blanco" className="h-24" />
      <h1 className="font-display text-4xl">Aquí no hay nada</h1>
      <p className="text-ink-500">La página que buscas no existe o no tienes acceso.</p>
      <ButtonLink href="/">Volver al inicio</ButtonLink>
    </div>
  );
}
