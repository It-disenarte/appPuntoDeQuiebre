/** Bytes iniciales necesarios para reconocer los contenedores permitidos. */
export const SIGNATURE_BYTES = 12;

const MP4_BOXES = new Set(["ftyp", "moov", "mdat", "free", "wide", "skip"]);

/** Comprueba que el inicio del archivo sea de verdad un video del tipo declarado (no solo el encabezado Content-Type). */
export function matchesVideoSignature(head: Uint8Array, contentType: string): boolean {
  if (head.length < SIGNATURE_BYTES) return false;
  if (contentType === "video/webm") {
    return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  }
  if (contentType === "video/mp4" || contentType === "video/quicktime") {
    return MP4_BOXES.has(String.fromCharCode(head[4]!, head[5]!, head[6]!, head[7]!));
  }
  return false;
}
