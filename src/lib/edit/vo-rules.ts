// Reglas de la voz en off (sin dependencias del servidor: las usan también los componentes del navegador).

/** Tomas cortas, voz de hasta 2 minutos y 1 GB entre todas las tomas. */
export const VO_MAX_CLIP_SECONDS = 20;
export const VO_MAX_SECONDS = 120;
export const VO_MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
export const VO_MAX_AUDIO_BYTES = 40 * 1024 * 1024;

/** Formatos de audio que se aceptan al subir una voz ya grabada. */
export const VOICE_FILE_TYPES: Record<string, string> = { "audio/mp4": "audio/mp4", "audio/x-m4a": "audio/mp4", "audio/m4a": "audio/mp4", "audio/mpeg": "audio/mpeg", "audio/mp3": "audio/mpeg", "audio/webm": "audio/webm", "audio/ogg": "audio/ogg" };
