// Alta del creador, según las skills de Mishell: "Tu historia" (7 pasos por voz o texto) y elecciones rápidas.
// Las preguntas vienen de skills/brujula/v2/skill.md (sección 1B). Si cambian, sube INTAKE_VERSION.
import { z } from "zod";

export const INTAKE_VERSION = "2026-10-brujula-v2";

export type StepId = "calentamiento" | "por_que_empezaste" | "que_te_molesta" | "mayor_orgullo" | "a_quien_le_hablas" | "historia" | "que_vendes";

export type StoryStep = {
  id: StepId;
  n: number;
  title: string;
  question: string;
  /** Mínimos para dar la respuesta por buena (por audio o por texto). 0 = sin mínimo. */
  minSeconds: number;
  minWords: number;
  /** Única repregunta amable si la respuesta queda corta. */
  followUp: string;
  /** Respuestas rápidas en lugar de hablar. */
  kind: "voz" | "venta";
};

export const STORY_STEPS: StoryStep[] = [
  {
    id: "calentamiento",
    n: 1,
    title: "Preséntate",
    question: "Preséntate como si le hablaras a una amiga que acabas de conocer.",
    minSeconds: 30,
    minWords: 50,
    followUp: "¿Y a qué te dedicas o qué te gusta hacer en tu día a día?",
    kind: "voz",
  },
  {
    id: "por_que_empezaste",
    n: 2,
    title: "Por qué empezaste",
    question: "¿Cuándo decidiste dedicarte a esto? ¿Qué estaba pasando en tu vida?",
    minSeconds: 45,
    minWords: 80,
    followUp: "¿Y cómo te sentiste en ese momento?",
    kind: "voz",
  },
  {
    id: "que_te_molesta",
    n: 3,
    title: "Lo que te molesta",
    question: "¿Qué te molesta de cómo se hace allá afuera?",
    minSeconds: 45,
    minWords: 80,
    followUp: "¿Y qué harías tú diferente?",
    kind: "voz",
  },
  {
    id: "mayor_orgullo",
    n: 4,
    title: "Tu mayor orgullo",
    question: "¿Cuál es tu mayor orgullo, eso que nadie ve pero sabes que te costó?",
    minSeconds: 45,
    minWords: 80,
    followUp: "¿Qué pasó después?",
    kind: "voz",
  },
  {
    id: "a_quien_le_hablas",
    n: 5,
    title: "A quién le hablas",
    question: "¿Qué le dirías a alguien que hoy se siente como tú antes de empezar?",
    minSeconds: 45,
    minWords: 80,
    followUp: "¿Y qué es lo primero que le recomendarías hacer?",
    kind: "voz",
  },
  {
    id: "historia",
    n: 6,
    title: "Cuéntanos una historia",
    question: "Elige una y cuéntala completa: algo salió mal y lo resolviste, el día que supiste que esto era lo tuyo, o algo que te apasiona.",
    minSeconds: 120,
    minWords: 250,
    followUp: "¿Qué pasó después? ¿Cómo terminó?",
    kind: "voz",
  },
  {
    id: "que_vendes",
    n: 7,
    title: "¿Vendes algo?",
    question: "¿Vendes o quieres vender algo?",
    minSeconds: 0,
    minWords: 0,
    followUp: "",
    kind: "venta",
  },
];

export const STORY_CHOICES = [
  { value: "algo_salio_mal", label: "Algo salió mal y lo resolví" },
  { value: "dia_que_supe", label: "El día que supe que esto era lo mío" },
  { value: "lo_que_me_apasiona", label: "Algo que me apasiona" },
] as const;
export type StoryChoice = (typeof STORY_CHOICES)[number]["value"];
export const STORY_CHOICE_VALUES = STORY_CHOICES.map((c) => c.value) as [StoryChoice, ...StoryChoice[]];

export const SELL_OPTIONS = [
  { value: "no", label: "No por ahora" },
  { value: "hoy", label: "Sí, hoy" },
  { value: "despues", label: "Más adelante" },
] as const;
export type SellMode = (typeof SELL_OPTIONS)[number]["value"];
export const SELL_VALUES = SELL_OPTIONS.map((o) => o.value) as [SellMode, ...SellMode[]];

export const getStep = (id: string) => STORY_STEPS.find((s) => s.id === id) ?? null;

export const MAX_STEP_CHARS = 6000;
export const MAX_STEP_SECONDS = 300;

/* ───────────── Lo que se guarda ───────────── */

export type StepAnswer =
  | { skipped: true }
  | { skipped?: false; text: string; source: "audio" | "texto"; seconds: number | null; mock: boolean };

export type Story = {
  steps: Partial<Record<StepId, StepAnswer>>;
  storyChoice?: StoryChoice;
  sell?: { mode: SellMode; text: string };
};

export const wordCount = (text: string): number => (text.toLowerCase().match(/[a-záéíóúüñ0-9]+/gi) ?? []).length;

/** ¿El paso ya está resuelto (respondido o saltado)? */
export function stepDone(story: Story, id: StepId): boolean {
  if (id === "que_vendes") return Boolean(story.sell) || Boolean(story.steps.que_vendes?.skipped);
  return Boolean(story.steps[id]);
}

export function storyProgress(story: Story | null) {
  const s = story ?? { steps: {} };
  const done = STORY_STEPS.filter((x) => stepDone(s, x.id)).length;
  const next = STORY_STEPS.find((x) => !stepDone(s, x.id));
  return { done, total: STORY_STEPS.length, nextStep: next?.id ?? null, complete: !next };
}

/* ───────────── Elecciones rápidas ───────────── */

const o = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const NETWORKS = o(["instagram", "Instagram"], ["tiktok", "TikTok"], ["facebook", "Facebook"], ["youtube", "YouTube"]);
export const FORMATS = o(
  ["frente_a_camara", "Frente a cámara"],
  ["voz_en_off_con_clips", "Voz en off con clips"],
  ["frase_en_pantalla", "Frase en pantalla"],
  ["manos", "Solo mis manos"],
  ["entrevista_podcast", "Entrevista o podcast"],
  ["en_vivo", "En vivo"],
);
export const TONES = o(
  ["inspiradora", "Inspirador/a"],
  ["autentica", "Auténtico/a"],
  ["energetica", "Enérgico/a"],
  ["cercana", "Cercano/a"],
  ["divertida", "Divertido/a"],
  ["profesional", "Profesional"],
  ["directa", "Directo/a"],
  ["tranquila", "Tranquilo/a"],
  ["atrevida", "Atrevido/a"],
);
export const MIN_REFERENTS = 3;
export const MAX_REFERENTS = 5;

const vals = (opts: { value: string }[]) => opts.map((x) => x.value) as [string, ...string[]];

export const quickSchema = z.object({
  redes: z.array(z.enum(vals(NETWORKS))).min(1, "Elige al menos una red.").max(4),
  formatos: z.array(z.enum(vals(FORMATS))).min(1, "Elige al menos un formato.").max(6),
  tono: z.array(z.enum(vals(TONES))).min(1, "Elige al menos una palabra de tono.").max(3, "Elige máximo 3 palabras de tono."),
  referentes: z
    .array(z.string().trim().max(120))
    .transform((a) => a.filter(Boolean))
    .pipe(z.array(z.string()).min(MIN_REFERENTS, `Escribe al menos ${MIN_REFERENTS} cuentas de referencia.`).max(MAX_REFERENTS)),
});
export type Quick = z.infer<typeof quickSchema>;

export const labelOf = (opts: { value: string; label: string }[], v: string) => opts.find((x) => x.value === v)?.label ?? v;

/** Validación al leer lo guardado: un registro dañado se trata como inexistente. */
const stepAnswerSchema = z.union([
  z.object({ skipped: z.literal(true) }),
  z.object({ skipped: z.literal(false).optional(), text: z.string(), source: z.enum(["audio", "texto"]), seconds: z.number().nullable(), mock: z.boolean() }),
]);
export const storySchema = z.object({
  steps: z.record(z.string(), stepAnswerSchema),
  storyChoice: z.enum(STORY_CHOICE_VALUES).optional(),
  sell: z.object({ mode: z.enum(SELL_VALUES), text: z.string() }).optional(),
});
