import "server-only";

/**
 * Descarga segura de videos y miniaturas. Las direcciones vienen de un servicio externo (Apify), así que solo se descarga
 * de los servidores de contenido de Instagram, por https, con tope de tamaño y de tiempo. Si no, un resultado manipulado
 * podría hacer que el servidor pidiera direcciones internas.
 */
const MEDIA_HOSTS = [/(^|\.)cdninstagram\.com$/, /(^|\.)fbcdn\.net$/, /(^|\.)instagram\.com$/];

export function isMediaUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.port === "" && MEDIA_HOSTS.some((r) => r.test(u.hostname)) && raw.length <= 2000;
  } catch {
    return false;
  }
}

export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
export const MAX_THUMB_BYTES = 3 * 1024 * 1024;

/** Descarga con tope de bytes (corta si el archivo es más grande que lo permitido) y de tiempo. */
export async function downloadLimited(url: string, maxBytes: number, timeoutMs = 90_000): Promise<{ data: Buffer; contentType: string }> {
  if (!isMediaUrl(url)) throw new Error("Dirección de contenido no permitida");
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar (${res.status})`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("El archivo es demasiado grande");
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("El archivo es demasiado grande");
    }
    chunks.push(Buffer.from(value));
  }
  return { data: Buffer.concat(chunks), contentType: (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase() };
}
