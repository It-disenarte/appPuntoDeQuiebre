/**
 * Texto en español para un error de una subida. Cuando se cae la red, `fetch` lanza un TypeError con un mensaje en inglés
 * ("Failed to fetch" en Android, "Load failed" en iPhone, "NetworkError…" en Firefox); eso no se le muestra a nadie.
 * Los mensajes que ya mandó el servidor (Error normal) pasan tal cual: vienen en español.
 */
export function errorText(e: unknown, fallback: string): string {
  if (e instanceof TypeError && /failed to fetch|load failed|network|fetch/i.test(e.message)) return "Sin conexión. Revisa tu internet e intenta de nuevo.";
  return e instanceof Error && e.message ? e.message : fallback;
}
