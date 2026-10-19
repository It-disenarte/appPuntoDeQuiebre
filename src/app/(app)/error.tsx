"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

// Dentro de la app el menú de abajo sigue visible: el error solo reemplaza el contenido de la página.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} compact />;
}
