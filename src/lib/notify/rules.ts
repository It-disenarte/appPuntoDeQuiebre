// Cuándo avisarle al creador. Lógica pura (sin base de datos) para poder probarla: el worker revisa cada 5 minutos y
// manda lo que "ya toca"; la tabla `notifications` (única por usuario, tipo y referencia) evita mandar dos veces lo mismo.
import { addDays, dowMon0, DAY_CODES, TZ } from "@/lib/plan/rules";

export type DueNotification = { kind: string; refKey: string; title: string; body: string; url: string; actionTitle?: string };

export type NotifyContext = {
  now: Date;
  name: string;
  /** Si ya terminó (o no) las partes del alta. */
  accountCreatedAt: Date;
  manualApproved: boolean;
  /** Bloques fijos del horario aceptado (día L–D, inicio y fin HH:MM) y bloque de respaldo. */
  blocks: { tipo: "fijo" | "respaldo"; dia: string | null; inicio: string | null; fin: string | null }[];
  /** Piezas de la semana vigente. */
  pieces: { id: string; day: string; publishTime: string; topic: string; kind: "video" | "carrusel"; status: string }[];
  /** Historia de hoy (si hay idea) y si ya la hizo. */
  storyToday: { id: string; done: boolean; tipo: string } | null;
  /** Meses (AAAA-MM) con informe de métricas ya enviado. */
  metricPeriods: string[];
  /** ¿Ya grabó o publicó algo el mes pasado? Si no, no hay métricas que pedir (por defecto sí). */
  metricsEligible?: boolean;
  pausedUntil: string | null;
  enabled: boolean;
};

/** Fecha y minutos del día en la zona del creador. */
export function localParts(now: Date, tz = TZ): { date: string; minutes: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
};
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Cuánto tiempo después de la hora programada sigue valiendo un aviso (por si el worker estuvo detenido). */
export const GRACE_MIN = 40;
const inWindow = (nowMin: number, at: number) => nowMin >= at && nowMin < at + GRACE_MIN;

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthName = (period: string) => MONTHS[Number(period.slice(5, 7)) - 1] ?? period;
export const previousPeriod = (date: string) => {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export function dueNotifications(ctx: NotifyContext): DueNotification[] {
  if (!ctx.enabled) return [];
  const { date: today, minutes: nowMin } = localParts(ctx.now);
  if (ctx.pausedUntil && ctx.pausedUntil >= today) return []; // modo pausa: se silencia todo
  const out: DueNotification[] = [];
  const first = ctx.name.split(" ")[0];

  // 1) Grabación: el día anterior a las 20:00 (o al terminar el bloque si ese día graba) y 1 hora antes.
  const fixed = ctx.blocks.filter((b) => b.tipo === "fijo" && b.dia && b.inicio && b.fin);
  for (const b of fixed) {
    const start = toMin(b.inicio!);
    const dow = DAY_CODES.indexOf(b.dia as (typeof DAY_CODES)[number]);
    // ¿Es hoy el día del bloque? Aviso 1 h antes.
    if (dowMon0(today) === dow && inWindow(nowMin, start - 60)) {
      out.push({ kind: "grabar_1h", refKey: today, title: "En una hora grabas", body: `${first}, llega con tu guion leído y tu luz lista.`, url: "/grabar" });
    }
    // ¿Es mañana el día del bloque? Aviso la noche anterior.
    if ((dowMon0(today) + 1) % 7 === dow) {
      const prev = fixed.find((x) => x.dia === DAY_CODES[dowMon0(today)] && toMin(x.inicio!) <= 20 * 60 && toMin(x.fin!) > 20 * 60);
      const at = prev ? toMin(prev.fin!) : 20 * 60;
      if (inWindow(nowMin, at)) {
        out.push({ kind: "grabar_dia_antes", refKey: addDays(today, 1), title: prev ? "¡Bien! Mañana repites" : "Mañana grabas", body: `Mañana grabas a las ${hhmm(start)}. Ten tu guion y tu luz listos.`, url: "/semana" });
      }
    }
  }
  const backup = ctx.blocks.find((b) => b.tipo === "respaldo" && b.dia && b.inicio);
  if (backup && (dowMon0(today) + 1) % 7 === DAY_CODES.indexOf(backup.dia as (typeof DAY_CODES)[number]) && inWindow(nowMin, 20 * 60 + 15)) {
    out.push({ kind: "grabar_respaldo", refKey: addDays(today, 1), title: "Tu día extra", body: "Si mañana puedes, es tu día extra de grabación. Si no, no pasa nada.", url: "/semana" });
  }

  // 2) Historia del día a las 9:00 (si todavía no la hace).
  if (ctx.storyToday && !ctx.storyToday.done && inWindow(nowMin, 9 * 60)) {
    out.push({ kind: "historia_dia", refKey: today, title: "Tu idea de historia de hoy", body: "Te toma menos de 5 minutos y mantiene tu racha.", url: "/hoy" });
  }

  // 3) Publicación: 30 minutos antes de la hora de cada pieza de hoy que siga pendiente.
  for (const p of ctx.pieces) {
    if (p.day !== today || p.status === "publicado" || p.status === "descartado") continue;
    if (inWindow(nowMin, toMin(p.publishTime) - 30)) {
      out.push({ kind: "publicar", refKey: p.id, title: `Hoy publicas a las ${p.publishTime}`, body: p.topic, url: `/semana/${p.id}` });
    }
  }

  // 4) Métricas: el día 1 de cada mes a las 10:00, pedir las capturas del mes anterior.
  if (today.slice(8, 10) === "01" && inWindow(nowMin, 10 * 60)) {
    const period = previousPeriod(today);
    if (ctx.metricsEligible !== false && !ctx.metricPeriods.includes(period)) {
      out.push({ kind: "metricas_mensual", refKey: period, title: `Pásame tus métricas de ${monthName(period)}`, body: "Toma unas capturas de las estadísticas de tu Instagram y te explico cómo te fue. Te digo dónde buscarlas.", url: "/progreso/metricas", actionTitle: "Subir mis capturas" });
    }
  }

  // 5) Brújula atrasada: a los 10 días sin terminar, un aviso amable (una vez por semana).
  const ageDays = Math.floor((ctx.now.getTime() - ctx.accountCreatedAt.getTime()) / 86_400_000);
  if (!ctx.manualApproved && ageDays >= 10 && inWindow(nowMin, 11 * 60)) {
    const week = Math.floor(ageDays / 7);
    out.push({ kind: "alta_atrasada", refKey: `s${week}`, title: "¿Seguimos con tu brújula?", body: "Con ella tus guiones suenan a ti. Son pocos minutos y puedes retomarla donde la dejaste.", url: "/mi-marca/historia" });
  }
  return out;
}
