// Contenido de "Presentación y compromiso" (fase 1 del arranque).
// PROPUESTA editable: al cambiar textos o preguntas, sube COMMITMENT_VERSION.

export const COMMITMENT_VERSION = "2026-10-v1";

export const COMMITMENT_SLIDES = [
  {
    title: "Aprende a crear tu contenido sin agencias",
    body: "Esta app te dice qué grabar, te ayuda a grabarlo, lo publica en Instagram y mide qué funciona. Cada semana tus guiones salen mejores.",
  },
  {
    title: "Así medimos tus resultados",
    body: "Te comparamos contra ti mismo, no contra otros: seguidores, vistas, guardados y constancia. Te lo explicamos en lenguaje sencillo.",
  },
  {
    title: "Los primeros 90 días son de siembra",
    body: "Al principio crecer es lento. Lo que siembras ahora es lo que cosechas después. Lo importante es no soltar el ritmo.",
  },
  {
    title: "Lo que necesitas",
    body: "Aparecer en cámara, 4 a 5 horas por semana en 2 sesiones de grabación y tu teléfono. Nada más.",
  },
  {
    title: "Crear contenido requiere esfuerzo",
    body: "Habrá semanas difíciles. La app, la comunidad y las sesiones en vivo con Erick están para que no te rindas.",
  },
] as const;

export const COMMITMENT_QUESTIONS = [
  {
    id: "siembra",
    question: "¿Cuánto dura la etapa de siembra?",
    options: [
      { id: "a", text: "Una semana" },
      { id: "b", text: "Los primeros 90 días" },
      { id: "c", text: "Un año" },
    ],
    correct: "b",
    hint: "Los primeros 90 días son de siembra: al principio el crecimiento es lento.",
  },
  {
    id: "horas",
    question: "¿Cuánto tiempo a la semana necesitas?",
    options: [
      { id: "a", text: "1 hora" },
      { id: "b", text: "De 4 a 5 horas, en 2 sesiones de grabación" },
      { id: "c", text: "Todos los días, todo el día" },
    ],
    correct: "b",
    hint: "Son de 4 a 5 horas por semana en 2 sesiones fijas de grabación.",
  },
  {
    id: "grabar",
    question: "¿Desde dónde grabas tus videos?",
    options: [
      { id: "a", text: "Desde mi teléfono, con la app" },
      { id: "b", text: "Con una cámara profesional" },
      { id: "c", text: "Lo graba una agencia" },
    ],
    correct: "a",
    hint: "Se graba desde el teléfono, con el teleprompter de la app.",
  },
  {
    id: "medir",
    question: "Si un video no funciona, ¿qué pasa?",
    options: [
      { id: "a", text: "Empiezo de cero" },
      { id: "b", text: "La app aprende y mejora los guiones de la siguiente semana" },
      { id: "c", text: "Nada, no se mide" },
    ],
    correct: "b",
    hint: "Las métricas ajustan los guiones de la siguiente semana.",
  },
] as const;

export type CommitmentAnswers = Record<string, string>;

/** Devuelve los ids de las preguntas respondidas mal (vacío = todo correcto). */
export function wrongAnswers(answers: CommitmentAnswers): string[] {
  return COMMITMENT_QUESTIONS.filter((q) => answers[q.id] !== q.correct).map((q) => q.id);
}
