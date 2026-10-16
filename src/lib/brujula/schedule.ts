// Skill 3 · Horario (horario-v1). Reglas fijas, sin IA: son pocas respuestas con opciones cerradas, sale igual cada vez
// y no cuesta tokens (así lo define skills/horario/v1/skill.md). Aquí se implementan sus reglas numeradas.
import { z } from "zod";
import { horarioV1Output, type HorarioV1 } from "@/lib/skills/schemas";

export const HORARIO_VERSION = "horario-v1";

export const DAYS = [
  { code: "L", label: "Lunes", short: "L", idx: 0 },
  { code: "M", label: "Martes", short: "M", idx: 1 },
  { code: "X", label: "Miércoles", short: "X", idx: 2 },
  { code: "J", label: "Jueves", short: "J", idx: 3 },
  { code: "V", label: "Viernes", short: "V", idx: 4 },
  { code: "S", label: "Sábado", short: "S", idx: 5 },
  { code: "D", label: "Domingo", short: "D", idx: 6 },
] as const;
export type DayCode = (typeof DAYS)[number]["code"];
const DAY_CODES = DAYS.map((d) => d.code) as [DayCode, ...DayCode[]];
const day = (c: string) => DAYS.find((d) => d.code === c)!;
export const dayLabel = (c: string | null) => (c ? day(c).label : "");

export const MOMENTS = [
  { value: "manana", label: "Mañana", start: "08:00" },
  { value: "mediodia", label: "Mediodía", start: "12:00" },
  { value: "tarde", label: "Tarde", start: "16:00" },
  { value: "noche", label: "Noche", start: "19:00" },
] as const;
type MomentId = (typeof MOMENTS)[number]["value"];
const MOMENT_VALUES = MOMENTS.map((m) => m.value) as [MomentId, ...MomentId[]];

export const DURATIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 h" },
  { value: 90, label: "1 h 30" },
  { value: 120, label: "2 h" },
  { value: 180, label: "3 h" },
] as const;

export const PLACES = [
  { value: "casa", label: "Casa" },
  { value: "trabajo", label: "Oficina o trabajo" },
  { value: "exteriores", label: "Exteriores" },
  { value: "varia", label: "Varía" },
] as const;
export const LIGHTS = [
  { value: "natural", label: "Ventana / luz natural" },
  { value: "aro", label: "Aro de luz" },
  { value: "lampara", label: "Lámpara" },
  { value: "ninguna", label: "Ninguna en especial" },
] as const;

export const scheduleAnswersSchema = z.object({
  dias: z
    .array(
      z.object({
        dia: z.enum(DAY_CODES),
        momentos: z.array(z.enum(MOMENT_VALUES)).min(1, "Elige en qué momento grabas cada día."),
        duracion_min: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120), z.literal(180)]),
        a_veces_no: z.boolean(),
      }),
    )
    .min(2, "Elige al menos 2 días.")
    .refine((a) => new Set(a.map((d) => d.dia)).size === a.length, "Hay un día repetido."),
  lugar: z.array(z.enum(["casa", "trabajo", "exteriores", "varia"])).min(1, "Elige dónde grabas."),
  luz: z.array(z.enum(["natural", "aro", "lampara", "ninguna"])).min(1, "Elige con qué luz cuentas."),
});
export type ScheduleAnswers = z.infer<typeof scheduleAnswersSchema>;
type DayAnswer = ScheduleAnswers["dias"][number];

const TARGET_MIN = 180; // meta de 3 a 4 horas por semana entre los fijos
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
};
const hours = (min: number) => Math.round((min / 60) * 10) / 10;
const hLabel = (min: number) => {
  const h = hours(min);
  return `${h === Math.floor(h) ? h : h.toString().replace(".", ",")} ${h === 1 ? "hora" : "horas"}`;
};
const circ = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));

type Planned = { day: DayAnswer; moment: MomentId; start: number; end: number };

function plan(d: DayAnswer): Planned {
  const moment = d.momentos[0]!;
  const start = toMin(MOMENTS.find((m) => m.value === moment)!.start);
  return { day: d, moment, start, end: start + d.duracion_min };
}

/** Regla 1 y 3: 2 fijos preferentemente entre semana y en días no seguidos; los "a veces no puedo" nunca son fijos. */
function pickFixed(safe: DayAnswer[]): DayAnswer[] {
  if (safe.length <= 2) return [...safe];
  let best: DayAnswer[] = [safe[0]!, safe[1]!];
  let bestScore = -Infinity;
  for (let i = 0; i < safe.length; i++) {
    for (let j = i + 1; j < safe.length; j++) {
      const a = safe[i]!;
      const b = safe[j]!;
      const weekdays = [a, b].filter((x) => day(x.dia).idx < 5).length;
      const score = weekdays * 100 + circ(day(a.dia).idx, day(b.dia).idx) * 10 + (a.duracion_min + b.duracion_min) / 30;
      if (score > bestScore) {
        bestScore = score;
        best = [a, b];
      }
    }
  }
  return best;
}

function adviceFor(a: ScheduleAnswers, fixed: Planned[]): string[] {
  const out: string[] = [];
  const nights = fixed.some((p) => p.moment === "noche");
  const days = fixed.some((p) => p.moment !== "noche");
  const hasAro = a.luz.includes("aro");
  const hasLamp = a.luz.includes("lampara");
  if (nights && !hasAro && !hasLamp) {
    out.push("Grabas de noche y tu luz es limitada: consigue un aro de luz, o graba de tarde. Es lo que más mejora la imagen con menos gasto.");
  } else if (nights && (hasAro || hasLamp)) {
    out.push(
      hasAro && hasLamp
        ? "De noche pon el aro de frente a la altura de tus ojos y la lámpara a un lado; que las dos den el mismo tono de luz (cálida o blanca)."
        : "De noche pon tu luz de frente a la altura de tus ojos, nunca desde arriba o a tus espaldas.",
    );
  }
  if (days && a.luz.includes("natural")) out.push("De día aprovecha tu ventana: colócate de frente a ella y no con la luz a tus espaldas.");
  const short = fixed.filter((p) => p.day.duracion_min <= 60);
  if (short.length) out.push("En tus bloques de 1 hora graba un solo video, y llega con el guion ya leído (o usa el teleprompter de la app).");
  if (a.lugar.includes("exteriores")) out.push("En exteriores evita el sol de mediodía y cuida el viento: arruina el audio.");
  if (a.lugar.includes("trabajo")) out.push("En la oficina graba en el horario de menos ruido.");
  if (fixed.some((p) => p.day.duracion_min >= 120)) out.push("Graba todo el bloque en una sola sesión de vestuario, o cambia de outfit entre videos para que parezcan días distintos.");
  out.push("Pon el celular a la altura de tus ojos.");
  return [...new Set(out)].slice(0, 3);
}

/** Construye el horario completo con las reglas de horario-v1. */
export function buildSchedule(input: ScheduleAnswers, ctx: { mejorHoraPublicar?: string | null } = {}): HorarioV1 {
  const a = scheduleAnswersSchema.parse(input);
  const byIdx = [...a.dias].sort((x, y) => day(x.dia).idx - day(y.dia).idx);
  let safe = byIdx.filter((d) => !d.a_veces_no);
  const risky = byIdx.filter((d) => d.a_veces_no);

  // Si todos los días son "a veces no puedo" se promueven los 2 más largos (la regla pide fijos igual).
  let promotedNote: string | null = null;
  if (safe.length < 2) {
    const need = 2 - safe.length;
    const promoted = [...risky].sort((x, y) => y.duracion_min - x.duracion_min).slice(0, need);
    safe = [...safe, ...promoted].sort((x, y) => day(x.dia).idx - day(y.dia).idx);
    promotedNote = "Marcaste que a veces no puedes en casi todos tus días, así que tomamos los más largos como fijos.";
  }
  const riskyLeft = risky.filter((d) => !safe.includes(d));

  let fixedDays = pickFixed(safe);
  // Regla 1: si los fijos no llegan a 3 h y hay más días seguros, se suman como fijos.
  const spare = () => safe.filter((d) => !fixedDays.includes(d));
  while (fixedDays.reduce((s, d) => s + d.duracion_min, 0) < TARGET_MIN && spare().length) {
    const next = spare().sort((x, y) => Number(day(x.dia).idx < 5) - Number(day(y.dia).idx < 5) || y.duracion_min - x.duracion_min)[0]!;
    fixedDays = [...fixedDays, next];
  }
  fixedDays.sort((x, y) => day(x.dia).idx - day(y.dia).idx);
  const fixed = fixedDays.map(plan);
  const fixedMin = fixed.reduce((s, p) => s + p.day.duracion_min, 0);

  // Respaldo: un día "a veces no puedo" o un día seguro que sobre; si no hay, es flotante.
  const backupDay = [...riskyLeft, ...spare()].sort((x, y) => y.duracion_min - x.duracion_min)[0] ?? null;
  const backup = backupDay ? plan(backupDay) : null;

  const bloques: HorarioV1["bloques"] = fixed.map((p) => ({ tipo: "fijo" as const, dia: p.day.dia, inicio: hhmm(p.start), fin: hhmm(p.end) }));
  if (backup) {
    bloques.push({ tipo: "respaldo", dia: backup.day.dia, inicio: hhmm(backup.start), fin: hhmm(backup.end), nota: "día extra cuando sí se pueda" });
  } else {
    bloques.push({ tipo: "respaldo", dia: null, inicio: null, fin: null, flotante: true, nota: "Si faltas a un bloque, la app te pregunta qué otro día de esa semana lo recuperas." });
  }

  const extraMin = backup ? backup.day.duracion_min : 0;
  const sugerencia =
    fixedMin < TARGET_MIN
      ? `Tus días seguros suman ${hLabel(fixedMin)}.${
          backup ? ` Si puedes, alarga una de tus sesiones; si no, ${dayLabel(backup.day.dia).toLowerCase()} es tu día extra para llegar a ${hLabel(fixedMin + extraMin)}.` : " Si puedes, alarga una sesión o suma otro día."
        }`
      : null;

  const mejor = ctx.mejorHoraPublicar && /^\d{2}:\d{2}$/.test(ctx.mejorHoraPublicar) ? ctx.mejorHoraPublicar : null;
  const publicar = mejor
    ? { hora: mejor, por_que: "Es cuando más seguidores tienes conectados" }
    : { hora: "18:00", por_que: "Es una hora que suele funcionar entre semana; la ajustamos cuando conectes tu Instagram" };

  // Regla 7: aviso el día anterior a las 20:00 y 1 hora antes; si el aviso cae dentro de otro bloque, al terminarlo.
  const recordatorios: HorarioV1["recordatorios"] = [];
  const prevDay = (c: string) => DAYS[(day(c).idx + 6) % 7]!;
  for (const p of fixed) {
    const prev = prevDay(p.day.dia);
    const prevBlock = fixed.find((q) => q.day.dia === prev.code);
    const inside = prevBlock && prevBlock.start <= 20 * 60 && prevBlock.end > 20 * 60;
    if (inside) {
      recordatorios.push({ cuando: `${prev.label.toLowerCase()} ${hhmm(prevBlock!.end)}`, texto: `¡Bien! Mañana repites a las ${hhmm(p.start)}` });
    } else {
      recordatorios.push({ cuando: `${prev.label.toLowerCase()} 20:00`, texto: `Mañana grabas a las ${hhmm(p.start)}. Ten tu guion y tu luz listos` });
    }
    recordatorios.push({ cuando: `${dayLabel(p.day.dia).toLowerCase()} ${hhmm(p.start - 60)}`, texto: "En una hora grabas. Llega con tu guion leído" });
  }
  if (backup) {
    recordatorios.push({
      cuando: `${prevDay(backup.day.dia).label.toLowerCase()} 20:00`,
      texto: `Si mañana puedes, es tu día extra: ${hLabel(backup.day.duracion_min)} de grabación. Ten listo lo que vas a grabar`,
    });
  }
  recordatorios.push({ cuando: "si falta a un bloque", texto: "No pasa nada. ¿Qué otro día de esta semana lo recuperas?" });

  const consejos = adviceFor(a, fixed);
  if (promotedNote) consejos.unshift(promotedNote);

  const names = fixed.map((p) => `${dayLabel(p.day.dia).toLowerCase()} (${hhmm(p.start)})`).join(" y ");
  const mensaje = `Tu semana creativa: ${names}.${backup ? ` ${dayLabel(backup.day.dia)} queda como día extra cuando se pueda.` : ""} Si un día no se puede, lo recuperas otro día de esa semana.`;

  return horarioV1Output.parse({
    skill_version: HORARIO_VERSION,
    bloques,
    horas_semana: hours(fixedMin),
    ...(backup ? { horas_con_extra: hours(fixedMin + extraMin) } : {}),
    sugerencia,
    publicar,
    recordatorios,
    consejos: consejos.slice(0, 3),
    mensaje,
  });
}

/** Franja legible de un bloque. */
export const blockRange = (b: { inicio: string | null; fin: string | null }) => (b.inicio && b.fin ? `${b.inicio} a ${b.fin} h` : "por definir");
