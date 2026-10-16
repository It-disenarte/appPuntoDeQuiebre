// Horario de grabación: 5 preguntas de opción múltiple y una propuesta de 2 bloques + 1 de respaldo.
// Es lógica de reglas (sin IA): rápida, gratis y predecible.
import { z } from "zod";

export const DAYS = [
  { value: "lun", label: "Lunes", n: 1 },
  { value: "mar", label: "Martes", n: 2 },
  { value: "mie", label: "Miércoles", n: 3 },
  { value: "jue", label: "Jueves", n: 4 },
  { value: "vie", label: "Viernes", n: 5 },
  { value: "sab", label: "Fin de semana", n: 6 },
] as const;
type DayValue = (typeof DAYS)[number]["value"];
const DAY_VALUES = DAYS.map((d) => d.value) as [DayValue, ...DayValue[]];
const dayInfo = (v: string) => DAYS.find((d) => d.value === v)!;

export const SCHEDULE_QUESTIONS = {
  days: { label: "¿Qué días tienes libres entre semana para grabar?", hint: "Elige al menos 2. Grabarás 2 veces por semana.", options: DAYS.map((d) => ({ value: d.value, label: d.label })) },
  moment: {
    label: "¿En qué momento del día te va mejor?",
    options: [
      { value: "manana", label: "Por la mañana" },
      { value: "tarde", label: "Por la tarde" },
      { value: "noche", label: "Por la noche" },
    ],
  },
  duration: {
    label: "¿Cuánto tiempo seguido puedes dedicarle?",
    options: [
      { value: "60", label: "Alrededor de 1 hora" },
      { value: "120", label: "Alrededor de 2 horas" },
      { value: "150", label: "2 horas y media o más" },
    ],
  },
  place: {
    label: "¿Dónde vas a grabar normalmente?",
    options: [
      { value: "casa", label: "En mi casa" },
      { value: "trabajo", label: "En mi lugar de trabajo" },
      { value: "exterior", label: "Al aire libre" },
      { value: "estudio", label: "En un estudio o espacio preparado" },
    ],
  },
  light: {
    label: "¿Con qué luz cuentas?",
    options: [
      { value: "natural", label: "Luz natural (ventana)" },
      { value: "lampara", label: "Lámparas de la casa" },
      { value: "aro", label: "Aro de luz o luces de video" },
      { value: "ninguna", label: "Casi ninguna" },
    ],
  },
} as const;

export const scheduleAnswersSchema = z.object({
  days: z.array(z.enum(DAY_VALUES)).min(2, "Elige al menos 2 días.").max(6),
  moment: z.enum(["manana", "tarde", "noche"], "Elige un momento del día."),
  duration: z.enum(["60", "120", "150"], "Elige cuánto tiempo tienes."),
  place: z.enum(["casa", "trabajo", "exterior", "estudio"], "Elige dónde grabas."),
  light: z.enum(["natural", "lampara", "aro", "ninguna"], "Elige tu tipo de luz."),
});
export type ScheduleAnswers = z.infer<typeof scheduleAnswersSchema>;

export const START_TIMES: Record<ScheduleAnswers["moment"], string> = { manana: "09:00", tarde: "16:00", noche: "19:30" };

export const scheduleBlockSchema = z.object({
  kind: z.enum(["principal", "respaldo"]),
  day: z.enum(DAY_VALUES),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  minutes: z.number().int().min(30).max(240),
});
export const proposalSchema = z.object({
  blocks: z.array(scheduleBlockSchema).min(2).max(3),
  reasons: z.array(z.string()).max(8),
  lightingAdvice: z.string().nullable(),
});
export type ScheduleBlock = z.infer<typeof scheduleBlockSchema>;
export type ScheduleProposal = z.infer<typeof proposalSchema>;

/** Distancia entre dos días de la semana (circular, de 1 a 3). */
const gap = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, 7 - d);
};

/** Elige 2 días principales lo más separados posible y un respaldo lejos de ambos. */
export function pickDays(free: string[]): { main: [string, string]; backup: string | null } {
  const days = [...new Set(free)].filter((d) => DAYS.some((x) => x.value === d)).sort((a, b) => dayInfo(a).n - dayInfo(b).n);
  if (days.length < 2) throw new Error("Se necesitan al menos 2 días.");
  let best: [string, string] = [days[0]!, days[1]!];
  let bestScore = -1;
  for (let i = 0; i < days.length; i++) {
    for (let j = i + 1; j < days.length; j++) {
      const score = gap(dayInfo(days[i]!).n, dayInfo(days[j]!).n);
      if (score > bestScore) {
        bestScore = score;
        best = [days[i]!, days[j]!];
      }
    }
  }
  const rest = days.filter((d) => !best.includes(d));
  let backup: string | null = null;
  let backupScore = -1;
  for (const d of rest) {
    const score = Math.min(gap(dayInfo(d).n, dayInfo(best[0]).n), gap(dayInfo(d).n, dayInfo(best[1]).n));
    if (score > backupScore) {
      backupScore = score;
      backup = d;
    }
  }
  return { main: best, backup };
}

export function lightingAdvice(a: Pick<ScheduleAnswers, "moment" | "light" | "place">): string | null {
  if (a.moment === "noche" && (a.light === "ninguna" || a.light === "lampara")) {
    return "Como grabas de noche y tu luz es limitada, te recomendamos un aro de luz. Es lo que más mejora la imagen con menos gasto.";
  }
  if (a.moment === "noche" && a.light === "natural") {
    return "De noche no tendrás luz natural. Apóyate en una lámpara frente a ti, o mejor, un aro de luz.";
  }
  if (a.light === "ninguna") return "Graba cerca de una ventana en el horario con más luz, o consigue un aro de luz.";
  if (a.place === "exterior") return "Al aire libre cuida el viento (el audio se arruina fácil) y graba con el sol de frente o de lado, no a tus espaldas.";
  if (a.light === "natural" && a.moment !== "noche") return "Aprovecha tu ventana: colócate de frente a ella y no con la luz a tus espaldas.";
  return null;
}

const MOMENT_TEXT = { manana: "por la mañana", tarde: "por la tarde", noche: "por la noche" } as const;

/** Propone 2 bloques de grabación y 1 de respaldo, con el porqué. */
export function proposeSchedule(a: ScheduleAnswers): ScheduleProposal {
  const { main, backup } = pickDays(a.days);
  const start = START_TIMES[a.moment];
  const minutes = Number(a.duration);
  const reasons = [
    `Elegimos ${dayInfo(main[0]).label.toLowerCase()} y ${dayInfo(main[1]).label.toLowerCase()} porque quedan lo más separados posible: así grabas fresco y siempre tienes material para toda la semana.`,
    `Los bloques son ${MOMENT_TEXT[a.moment]} porque dijiste que ese es tu mejor momento (${start}).`,
  ];
  if (minutes <= 60) {
    reasons.push("Con 1 hora por bloque quizá no alcance para todos los videos de la semana; el bloque de respaldo te ayuda a completar tus 4 a 5 horas semanales.");
  } else {
    reasons.push(`Cada bloque dura ${minutes >= 150 ? "2 horas y media" : "2 horas"}, suficiente para grabar los guiones de la semana por partes.`);
  }
  const blocks: ScheduleBlock[] = [
    { kind: "principal", day: main[0] as DayValue, start, minutes },
    { kind: "principal", day: main[1] as DayValue, start, minutes },
  ];
  if (backup) {
    blocks.push({ kind: "respaldo", day: backup as DayValue, start, minutes: Math.min(minutes, 90) });
    reasons.push(`Dejamos ${dayInfo(backup).label.toLowerCase()} de respaldo, por si un día se te complica.`);
  } else {
    reasons.push("No quedó ningún día libre para el respaldo; si puedes, agrega otro día para tener un plan B.");
  }
  return { blocks, reasons, lightingAdvice: lightingAdvice(a) };
}

export const dayLabel = (v: string) => dayInfo(v).label;
export const endTime = (start: string, minutes: number): string => {
  const [h, m] = start.split(":").map(Number);
  const total = h! * 60 + m! + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** Valida un ajuste manual: días distintos y al menos 2 bloques principales. */
export function validateAdjusted(blocks: ScheduleBlock[]): string | null {
  if (blocks.filter((b) => b.kind === "principal").length < 2) return "Deja al menos 2 bloques principales.";
  if (new Set(blocks.map((b) => b.day)).size !== blocks.length) return "Cada bloque debe ir en un día distinto.";
  return null;
}
