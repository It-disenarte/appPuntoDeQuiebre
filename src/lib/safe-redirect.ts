/**
 * Acepta solo rutas internas para redirigir tras el inicio de sesión (evita redirecciones abiertas).
 * Lista blanca: debe empezar con "/", nunca "//", y solo caracteres ASCII seguros de URL.
 * Rechaza cualquier "\" y las barras codificadas (%2F, %5C), así como unicode (p. ej. RTL override).
 */
const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9\-._~/?=&%]*$/;

export function safeRedirectPath(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length > 200) return fallback;
  if (!SAFE_PATH.test(value)) return fallback;
  if (/%(2f|5c)/i.test(value)) return fallback;
  return value;
}
