// Muestra de voz: temas, límites y análisis del perfil de voz a partir de la transcripción.
import { z } from "zod";

export const VOICE_TOPICS = [
  { value: "origen", label: "Por qué empecé", prompt: "Cuéntanos por qué empezaste en lo que haces y qué te movió a dar el paso." },
  { value: "molesta", label: "Lo que me molesta de mi industria", prompt: "Habla de eso que te molesta o que crees que se hace mal en tu industria." },
  { value: "orgullo", label: "Mi mayor orgullo", prompt: "Cuéntanos el logro del que estás más orgulloso o el momento que más te marcó." },
] as const;
export type VoiceTopic = (typeof VOICE_TOPICS)[number]["value"];
export const VOICE_TOPIC_VALUES = VOICE_TOPICS.map((t) => t.value) as [VoiceTopic, ...VoiceTopic[]];

export const VOICE_MIN_SECONDS = 90;
export const VOICE_MAX_SECONDS = 240;
export const VOICE_MIN_WORDS_TEXT = 150;
export const VOICE_MAX_BYTES = 8 * 1024 * 1024;

export const voiceProfileSchema = z.object({
  vocabulary: z.array(z.string()).max(12),
  fillers: z.array(z.object({ word: z.string(), count: z.number().int() })).max(10),
  pace: z.object({ wpm: z.number().nullable(), label: z.string() }),
  sentenceLength: z.number(),
  traits: z.array(z.string()).max(6),
  summary: z.string(),
});
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

const STOP = new Set(
  "de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti tu tus ellas nosotras vosotros vosotras os mío mía míos mías tuyo tuya suyo suya nuestro nuestra son fue era soy eres hace hacer tengo tiene tienen estoy está están ser ha han he había puede pueden voy va van vez cosas cosa así aquí allí ahí bien solo siempre después ahora entonces mismo misma".split(
    " ",
  ),
);

const FILLERS = ["o sea", "este", "pues", "bueno", "entonces", "básicamente", "la verdad", "digamos", "tipo", "como que", "no sé", "¿verdad?", "¿sí?", "así como", "mmm", "eh"];

const normalize = (s: string) => s.toLowerCase().replace(/[“”"«»]/g, "");
const words = (s: string) => normalize(s).match(/[a-záéíóúüñ]+/gi) ?? [];

function countPhrase(text: string, phrase: string): number {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![a-záéíóúüñ])${esc}(?![a-záéíóúüñ])`, "gi");
  return (text.match(re) ?? []).length;
}

/** Perfil de voz con reglas simples. Si hay duración (audio), calcula el ritmo en palabras por minuto. */
export function analyzeVoice(transcript: string, durationSeconds: number | null): VoiceProfile {
  const text = normalize(transcript);
  const ws = words(text);
  const total = ws.length;

  const freq = new Map<string, number>();
  for (const w of ws) if (w.length >= 5 && !STOP.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const vocabulary = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([w]) => w);

  const fillers = FILLERS.map((word) => ({ word, count: countPhrase(text, word) }))
    .filter((f) => f.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const sentences = transcript.split(/[.!?¿¡\n]+/).map((s) => s.trim()).filter((s) => words(s).length > 0);
  const sentenceLength = sentences.length ? Math.round((total / sentences.length) * 10) / 10 : 0;

  let wpm: number | null = null;
  let label = "No medido (texto escrito)";
  if (durationSeconds && durationSeconds >= 30) {
    wpm = Math.round(total / (durationSeconds / 60));
    label = wpm < 110 ? "Pausado" : wpm <= 150 ? "Natural" : "Ágil";
  }

  const traits: string[] = [];
  if (sentenceLength > 0 && sentenceLength <= 11) traits.push("frases cortas y directas");
  else if (sentenceLength >= 20) traits.push("frases largas y elaboradas");
  else if (sentenceLength > 0) traits.push("frases de largo medio");
  if ((transcript.match(/[?¿]/g) ?? []).length >= 3) traits.push("hace preguntas al público");
  if ((transcript.match(/!|¡/g) ?? []).length >= 3) traits.push("energía alta y exclamaciones");
  if (countPhrase(text, "tú") + countPhrase(text, "te") + countPhrase(text, "tu") >= 6) traits.push("habla directo al espectador");
  if (/\b(yo|mi|me)\b/.test(text) && countPhrase(text, "yo") + countPhrase(text, "mi") >= 6) traits.push("cuenta desde su experiencia personal");

  const fillerText = fillers.length ? `Tus muletillas más frecuentes: ${fillers.map((f) => `“${f.word}” (${f.count})`).join(", ")}.` : "Casi no usas muletillas.";
  const paceText = wpm ? `Hablas a ${wpm} palabras por minuto (${label.toLowerCase()}).` : "";
  const summary = [
    traits.length ? `Tu estilo: ${traits.join(", ")}.` : "Todavía hay poco texto para describir tu estilo.",
    paceText,
    fillerText,
    vocabulary.length ? `Palabras que más repites: ${vocabulary.slice(0, 5).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { vocabulary, fillers, pace: { wpm, label }, sentenceLength, traits: traits.slice(0, 6), summary };
}

export const wordCount = (text: string) => words(text).length;

/** Transcripción de PRUEBA mientras no hay servicio de transcripción conectado (Gemini). */
export const MOCK_TRANSCRIPT =
  "La verdad es que empecé esto por una razón muy sencilla: me cansé de ver cómo la gente se rendía antes de intentarlo. " +
  "O sea, yo también tuve miedo. Pues, al principio no sabía ni cómo ponerme frente a la cámara, y entonces dije: bueno, si no empiezo hoy, no empiezo nunca. " +
  "¿Y sabes qué? Cambió todo. Lo que más me molesta de mi industria es que todos hacen como que es muy complicado, cuando en realidad es cuestión de constancia. " +
  "Tú no necesitas un equipo enorme, necesitas un plan y las ganas de seguirlo. Yo lo aprendí a la mala, equivocándome muchas veces. " +
  "Mi mayor orgullo es haber ayudado a personas que pensaban que no podían, y que hoy tienen su propio proyecto. " +
  "Eso, para mí, vale más que cualquier número. Entonces, si estás pensando en empezar, empieza chiquito, pero empieza hoy. " +
  "Porque, la verdad, el mejor momento era ayer, y el segundo mejor es ahora mismo.";
