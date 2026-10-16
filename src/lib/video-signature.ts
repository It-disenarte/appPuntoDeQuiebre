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

export const AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
};

/** Firma de los primeros bytes de una grabación de audio (WebM, Ogg, MP4/M4A o MP3). */
export function matchesAudioSignature(head: Uint8Array, contentType: string): boolean {
  if (head.length < SIGNATURE_BYTES) return false;
  const ascii = (a: number, b: number) => String.fromCharCode(...Array.from(head.slice(a, b)));
  if (contentType === "audio/webm") return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  if (contentType === "audio/ogg") return ascii(0, 4) === "OggS";
  if (contentType === "audio/mp4" || contentType === "audio/x-m4a") return MP4_BOXES.has(ascii(4, 8));
  if (contentType === "audio/mpeg") return ascii(0, 3) === "ID3" || (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0);
  return false;
}
