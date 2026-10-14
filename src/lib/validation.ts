// Validaciones de dominio reutilizables (sin dependencias de servidor).

const MX_TZ = "America/Mexico_City";

/** Fecha de hoy (AAAA-MM-DD) en la Ciudad de México. */
export function todayInMexico(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MX_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Edad cumplida a partir de AAAA-MM-DD. Null si la fecha no es válida o es futura. */
export function ageFromBirthDate(birthDate: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  const [ty, tm, td] = todayInMexico(now).split("-").map(Number) as [number, number, number];
  let age = ty - y;
  if (tm < mo || (tm === mo && td < d)) age--;
  return age < 0 ? null : age;
}

export const MIN_AGE = 18;
export const MAX_AGE = 110;

/* ---------- CFDI 4.0 (solicitud de factura) ---------- */

/** RFC de persona moral (12) o física (13), incluido el genérico. */
export const RFC_REGEX = /^([A-ZÑ&]{3,4})(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{2})([A\d])$/;

export const REGIMENES_FISCALES: Record<string, string> = {
  "601": "General de Ley Personas Morales",
  "603": "Personas Morales con Fines no Lucrativos",
  "605": "Sueldos y Salarios e Ingresos Asimilados a Salarios",
  "606": "Arrendamiento",
  "608": "Demás ingresos",
  "612": "Personas Físicas con Actividades Empresariales y Profesionales",
  "616": "Sin obligaciones fiscales",
  "621": "Incorporación Fiscal",
  "625": "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  "626": "Régimen Simplificado de Confianza",
};

export const USOS_CFDI: Record<string, string> = {
  G03: "Gastos en general",
  I04: "Equipo de cómputo y accesorios",
  S01: "Sin efectos fiscales",
  CP01: "Pagos",
};
