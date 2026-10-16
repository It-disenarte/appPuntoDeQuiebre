// Análisis de la voz del creador con reglas simples. Se usa para la versión de PRUEBA del perfil de voz y para
// medir el ritmo; la skill real (perfil-voz-v1) lo hace Claude con la misma entrada.
import type { StepId } from "./content";

export const VOICE_MAX_BYTES = 8 * 1024 * 1024;

export type VoiceStats = {
  vocabulary: string[];
  fillers: { word: string; count: number }[];
  wpm: number | null;
  sentenceLength: number;
  questions: number;
  exclamations: number;
  secondPerson: number;
  firstPerson: number;
  totalWords: number;
};

const STOP = new Set(
  "de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti tu tus ellas nosotras son fue era soy eres hace hacer tengo tiene tienen estoy está están ser ha han he había puede pueden voy va van vez cosas cosa así aquí allí ahí bien solo siempre después ahora entonces mismo misma hoy cada hacia nadie alguien nunca jamás tampoco mucha muchas hojas veces momento persona personas gente tiempo vida hecho tipo errores error cosas lugar forma manera parte días día años año semana semanas meses mes parecía parecer decir dijo dicen dije hace hacer hizo".split(
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

/** Estadísticas de la muestra. Con duración (audio) también calcula el ritmo en palabras por minuto. */
export function analyzeVoice(transcript: string, durationSeconds: number | null): VoiceStats {
  const text = normalize(transcript);
  const ws = words(text);
  const total = ws.length;

  const freq = new Map<string, number>();
  for (const w of ws) if (w.length >= 5 && !STOP.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const vocabulary = [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([w]) => w);

  const fillers = FILLERS.map((word) => ({ word, count: countPhrase(text, word) }))
    .filter((f) => f.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const sentences = transcript.split(/[.!?¿¡\n]+/).map((s) => s.trim()).filter((s) => words(s).length > 0);
  const sentenceLength = sentences.length ? Math.round((total / sentences.length) * 10) / 10 : 0;
  const wpm = durationSeconds && durationSeconds >= 30 ? Math.round(total / (durationSeconds / 60)) : null;

  return {
    vocabulary,
    fillers,
    wpm,
    sentenceLength,
    questions: (transcript.match(/[?¿]/g) ?? []).length,
    exclamations: (transcript.match(/[!¡]/g) ?? []).length,
    secondPerson: countPhrase(text, "tú") + countPhrase(text, "te") + countPhrase(text, "tu"),
    firstPerson: countPhrase(text, "yo") + countPhrase(text, "mi") + countPhrase(text, "me"),
    totalWords: total,
  };
}

/**
 * Transcripciones de PRUEBA, una por paso, mientras no esté conectado el servicio de transcripción (Gemini).
 * Son texto de ejemplo de una creadora ficticia: no reflejan lo que el usuario dijo.
 */
export const MOCK_STORY: Record<Exclude<StepId, "que_vendes">, string> = {
  calentamiento:
    "Hola, pues yo soy una persona muy curiosa. Me dedico a trabajar con plantas y desde hace un tiempo quiero compartir lo que aprendo, porque la verdad me di cuenta de que a mucha gente le encantaría tener su propio huerto pero no sabe ni por dónde empezar. Me gusta cocinar con lo que cosecho, y me gusta platicar con la gente y reírme de mis errores.",
  por_que_empezaste:
    "La verdad es que empecé durante una época en la que me sentía muy estancada. Trabajaba muchas horas, llegaba cansada y entonces compré unas semillas casi por impulso. Pues, se me murieron todas, y eso me dio mucha risa y mucho coraje al mismo tiempo. Entonces decidí aprender bien, leí, pregunté y probé. Hoy me doy cuenta de que ese momento cambió la forma en que me veo a mí misma, porque entendí que podía aprender algo nuevo desde cero, y eso me animó a contarlo para que otras personas se animen también a intentarlo.",
  que_te_molesta:
    "Lo que más me molesta es que todo se presenta como si fuera facilísimo o como si necesitaras un equipo carísimo. O sea, ves videos donde todo sale perfecto y nadie enseña los errores, y entonces la gente se frustra y lo deja. Me molesta que se prometan resultados mágicos, porque eso no existe. Yo creo que lo honesto es decir que se aprende equivocándose, y que está bien. Lo que haría diferente es enseñar el proceso real, con lo que sale mal, y explicarlo sin palabras complicadas para que cualquiera lo entienda.",
  mayor_orgullo:
    "Mi mayor orgullo es haber sacado adelante una cosecha completa después de dos años de intentos fallidos. Nadie vio las veces que tiré todo y volví a empezar, ni las mañanas de regar antes de ir al trabajo. Pero cuando por fin probé mi primera ensalada hecha con lo que sembré, me dieron ganas de llorar. Entonces entendí que no se trata de tener suerte, sino de no soltar. Eso, para mí, vale más que cualquier cifra, y por eso hoy lo comparto con todos.",
  a_quien_le_hablas:
    "Le diría que empiece chiquito. Que no compre cien cosas, que no se compare con nadie y que se permita equivocarse. Tú no necesitas un jardín enorme, necesitas una maceta y ganas. Lo primero que le recomendaría es elegir una sola planta fácil, ponerla donde le dé el sol y observarla todos los días. Y que sepa que si se le muere, no pasa nada, porque de ahí se aprende. Yo también estuve donde estás tú, y aquí seguimos. Créeme que se puede, paso a paso y con mucha paciencia.",
  historia:
    "Te voy a contar algo que me salió muy mal y que al final resolví. Un día decidí sembrar jitomates en el balcón porque vi un video donde se veía facilísimo. Compré la tierra, las macetas y las semillas y me sentía lista. Pues, a las dos semanas las hojas se pusieron amarillas y luego se secaron. Yo no entendía nada. Entonces fui a preguntarle a un señor del mercado que vendía plantas y me dijo que probablemente estaba regando de más. La verdad me dio pena, porque pensé que mientras más agua, mejor. Cambié la forma de regar, hice agujeros en las macetas y volví a sembrar. Esta vez revisaba la tierra con el dedo antes de regar. A las pocas semanas aparecieron los primeros brotes y, meses después, mis primeros jitomates, chiquitos pero muy dulces. Lo que aprendí es que a veces el problema no es que te falte esfuerzo, sino que te sobra el que no toca. Desde entonces cuento mis errores primero, porque son los que más le sirven a los demás. Y si algo me ha enseñado esto es que lo que sale mal también es contenido, y también es aprendizaje. Hoy, cada vez que veo mis macetas llenas, me acuerdo de aquel balcón con las hojas amarillas y me da mucha ternura. Eso, para mí, es crecer. Por eso te invito a que cuentes tus propios errores sin miedo, porque nadie nace sabiendo y todos empezamos con las hojas amarillas, las macetas torcidas y muchas dudas.",
};
