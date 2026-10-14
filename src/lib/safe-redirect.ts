/** Acepta solo rutas internas ("/algo"), nunca "//dominio", "/\dominio" ni URLs absolutas: evita redirecciones abiertas. */
export function safeRedirectPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.length > 200 || /[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
