// Lógica pura (sin base de datos) del panel del administrador: progreso, racha, alertas de abandono y métricas del negocio.
const DAY = 86_400_000;
const TZ = "America/Mexico_City";

export type SubFacts = { plan: "basico" | "pro"; status: string; trialEnd: Date | null; createdAt: Date; pastDueSince: Date | null } | null;
export type Milestones = { intake: Date | null; manual: Date | null; kit: Date | null; schedule: Date | null; plan: Date | null; recording: Date | null; metrics: Date | null };
export type CreatorFacts = {
  user: { id: string; name: string; email: string; status: string; createdAt: Date; lastLoginAt: Date | null };
  sub: SubFacts;
  milestones: Milestones;
  workDates: Date[];
  lastSeen: Date | null;
  lastActivity: Date | null;
  streakWeeks: number;
  phase: string;
  doneCount: number;
};

export const MILESTONES = [
  { id: "intake", label: "Cuenta su historia" },
  { id: "manual", label: "Aprueba su brújula" },
  { id: "kit", label: "Aprueba su kit visual" },
  { id: "schedule", label: "Acepta su horario" },
  { id: "plan", label: "Genera su primera semana" },
  { id: "recording", label: "Sube su primera grabación" },
  { id: "metrics", label: "Entrega su primer informe de métricas" },
] as const;
export type MilestoneId = (typeof MILESTONES)[number]["id"];

/** Hace `n` días (para consultas de periodo). */
export const daysAgo = (n: number, now = new Date()) => new Date(now.getTime() - n * DAY);

/** Fecha (AAAA-MM-DD) en la zona de México. */
export const isoMx = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
/** Lunes de la semana de esa fecha, como AAAA-MM-DD. */
export function weekKey(d: Date): string {
  const iso = isoMx(d);
  const dow = (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
  return new Date(Date.parse(`${iso}T12:00:00Z`) - dow * DAY).toISOString().slice(0, 10);
}
const prevWeek = (k: string) => new Date(Date.parse(`${k}T12:00:00Z`) - 7 * DAY).toISOString().slice(0, 10);

/** Semanas seguidas con al menos una pieza grabada/programada/publicada o una grabación subida. Si esta semana aún no hay, cuenta desde la anterior. */
export function streakWeeks(dates: Date[], now = new Date()): number {
  const weeks = new Set(dates.map(weekKey));
  let k = weekKey(now);
  if (!weeks.has(k)) k = prevWeek(k);
  let n = 0;
  while (weeks.has(k)) {
    n += 1;
    k = prevWeek(k);
  }
  return n;
}

export function buildFacts(i: { user: CreatorFacts["user"]; sub: SubFacts; milestones: Milestones; workDates: Date[]; lastSeen: Date | null }, now = new Date()): CreatorFacts {
  const times = [i.user.lastLoginAt, i.lastSeen, ...i.workDates].filter((d): d is Date => Boolean(d));
  const lastActivity = times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;
  const doneCount = MILESTONES.filter((m) => i.milestones[m.id]).length;
  const next = MILESTONES.find((m) => !i.milestones[m.id]);
  return { ...i, lastActivity, streakWeeks: streakWeeks(i.workDates, now), phase: next ? next.label.replace(/^\w/, (c) => c.toLowerCase()) : "Todo al día", doneCount };
}

/** El nombre de la fase actual en lenguaje de equipo: lo que le falta por hacer. */
export const phaseLabel = (f: CreatorFacts) => (f.doneCount === MILESTONES.length ? "Todo al día" : `Falta: ${f.phase}`);

/* ───────────── Alertas de abandono (M12) ───────────── */

export type Alert = { userId: string; name: string; email: string; kind: "inactivo" | "racha_rota" | "alta_atrasada" | "pago"; detail: string; days: number };
export const ALERT_LABEL: Record<Alert["kind"], string> = { inactivo: "Sin actividad", racha_rota: "Racha rota", alta_atrasada: "Alta atrasada", pago: "Pago en mora" };

const hasAccess = (f: CreatorFacts) => f.user.status === "active" && f.sub !== null && ["active", "trialing", "past_due", "unpaid"].includes(f.sub.status);

export function alertsOf(facts: CreatorFacts[], now = new Date()): Alert[] {
  const out: Alert[] = [];
  const thisWeek = weekKey(now);
  const twoAgo = prevWeek(prevWeek(thisWeek));
  for (const f of facts) {
    if (!hasAccess(f)) continue;
    const base = { userId: f.user.id, name: f.user.name, email: f.user.email };
    const age = Math.floor((now.getTime() - f.user.createdAt.getTime()) / DAY);
    if (f.sub && ["past_due", "unpaid"].includes(f.sub.status)) out.push({ ...base, kind: "pago", detail: "Su último cobro falló.", days: f.sub.pastDueSince ? Math.floor((now.getTime() - f.sub.pastDueSince.getTime()) / DAY) : 0 });
    if (f.milestones.schedule === null && age >= 10) out.push({ ...base, kind: "alta_atrasada", detail: `Lleva ${age} días y no termina su alta (${f.phase}).`, days: age });
    const idle = f.lastActivity ? Math.floor((now.getTime() - f.lastActivity.getTime()) / DAY) : age;
    if (idle >= 7 && age >= 7) out.push({ ...base, kind: "inactivo", detail: f.lastActivity ? `Última actividad hace ${idle} días.` : "Nunca ha usado la app.", days: idle });
    const wk = new Set(f.workDates.map(weekKey));
    const dow = (new Date(`${isoMx(now)}T12:00:00Z`).getUTCDay() + 6) % 7;
    if (wk.has(prevWeek(thisWeek)) && wk.has(twoAgo) && !wk.has(thisWeek) && dow >= 2) out.push({ ...base, kind: "racha_rota", detail: "Venía grabando cada semana y esta semana todavía no ha grabado nada.", days: dow });
  }
  return out.sort((a, b) => b.days - a.days);
}

/* ───────────── Métricas del negocio (M11) ───────────── */

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function businessMetrics(facts: CreatorFacts[], now = new Date()) {
  const withSub = facts.filter((f) => f.sub);
  const alive = (s: string) => ["active", "trialing", "past_due"].includes(s);
  const trialsEnded = withSub.filter((f) => f.sub!.trialEnd && f.sub!.trialEnd < now);
  const paid = trialsEnded.filter((f) => f.sub!.status === "active");
  const cohort = (days: number) => {
    const c = withSub.filter((f) => now.getTime() - f.sub!.createdAt.getTime() >= days * DAY);
    return { total: c.length, kept: c.filter((f) => alive(f.sub!.status)).length };
  };
  const m30 = cohort(30);
  const m60 = cohort(60);
  const m90 = cohort(90);
  const pct = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 100));
  return {
    creators: facts.length,
    withSub: withSub.length,
    byStatus: Object.entries(withSub.reduce<Record<string, number>>((acc, f) => ((acc[f.sub!.status] = (acc[f.sub!.status] ?? 0) + 1), acc), {})),
    byPlan: { basico: withSub.filter((f) => f.sub!.plan === "basico").length, pro: withSub.filter((f) => f.sub!.plan === "pro").length },
    trialToPaid: { total: trialsEnded.length, paid: paid.length, pct: pct(paid.length, trialsEnded.length) },
    retention: { m2: { ...m30, pct: pct(m30.kept, m30.total) }, m3: { ...m60, pct: pct(m60.kept, m60.total) }, m4: { ...m90, pct: pct(m90.kept, m90.total) } },
    milestones: MILESTONES.map((m) => {
      const done = facts.filter((f) => f.milestones[m.id]);
      const days = done.map((f) => (f.milestones[m.id]!.getTime() - f.user.createdAt.getTime()) / DAY);
      return { id: m.id, label: m.label, done: done.length, pct: pct(done.length, facts.length), medianDays: median(days) === null ? null : Math.max(0, Math.round(median(days)! * 10) / 10) };
    }),
  };
}
