import type { Instrumentation } from "next";

/** Cada error del servidor (páginas, acciones, rutas) se anota para que el administrador lo vea en el panel. */
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const message = err instanceof Error ? err.message : String(err);
  const { recordError } = await import("@/lib/errors");
  await recordError({ source: "pagina", message, path: request.path });
};
