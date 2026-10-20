import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// tailwind-merge resuelve conflictos (p. ej. "text-ink-700" + "text-blanco" → gana la última).
// Se registran los colores de marca para que los reconozca.
const twMerge = extendTailwindMerge({
  extend: {
    theme: { color: ["azul", "azul-700", "azul-100", "azul-50", "negro", "naranja", "naranja-100", "blanco", "exito", "exito-100", "alerta", "alerta-100", { ink: ["900", "800", "700", "600", "500", "400", "300", "200", "100"] }] },
  },
});
export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

/* ---------- Button ---------- */

type ButtonVariant = "primary" | "dark" | "light" | "outline" | "ghost" | "accent" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "tap inline-flex items-center justify-center gap-2 rounded-full font-semibold select-none disabled:pointer-events-none disabled:opacity-50";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-azul text-blanco hover:bg-azul-700",
  dark: "bg-negro text-blanco hover:bg-ink-800",
  light: "bg-blanco text-azul hover:bg-azul-50",
  outline: "border border-ink-300 bg-transparent text-ink-900 hover:bg-ink-200/60",
  ghost: "bg-transparent text-ink-700 hover:bg-ink-200/60",
  // Naranja con texto negro (6.8:1). Úsalo para una sola acción por pantalla.
  accent: "bg-naranja text-negro hover:brightness-95",
  danger: "bg-transparent text-alerta hover:bg-alerta-100",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-13 px-6 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/* ---------- Card ---------- */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card bg-blanco p-5 shadow-card", className)} {...props} />;
}

/* ---------- Chip / etiqueta ---------- */

type ChipTone = "neutral" | "azul" | "azulSolid" | "naranja" | "exito" | "alerta" | "invert" | "outlineLight";
const chipTones: Record<ChipTone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  azul: "bg-azul-50 text-azul",
  azulSolid: "bg-azul text-blanco",
  naranja: "bg-naranja-100 text-ink-900",
  exito: "bg-exito-100 text-exito",
  alerta: "bg-alerta-100 text-alerta",
  invert: "bg-blanco text-azul",
  // Para usar sobre fondos azules o negros.
  outlineLight: "border border-blanco/70 text-blanco",
};

export function Chip({ tone = "neutral", className, children }: { tone?: ChipTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", chipTones[tone], className)}>
      {children}
    </span>
  );
}

/* ---------- Encabezado de página ---------- */

export function PageHeader({
  eyebrow,
  title,
  action,
  className,
  dark,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <header data-tour="pagina" className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className={cn("text-sm", dark ? "text-ink-400" : "text-ink-500")}>{eyebrow}</p>}
        <h1 className={cn("font-display mt-1 text-[2.25rem] lg:text-5xl", dark ? "text-blanco" : "text-negro")}>{title}</h1>
      </div>
      {action}
    </header>
  );
}

/* ---------- Campo de formulario ---------- */

export function Field({
  label,
  hint,
  className,
  id,
  ...input
}: ComponentProps<"input"> & { label: string; hint?: string }) {
  const inputId = id ?? input.name;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-semibold text-ink-800">
        {label}
      </label>
      <input
        id={inputId}
        className="h-12 rounded-xl border border-ink-300 bg-blanco px-4 text-base text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-azul focus:ring-4 focus:ring-azul/15"
        {...input}
      />
      {hint && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

const controlClass =
  "rounded-xl border border-ink-300 bg-blanco px-4 text-base text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-azul focus:ring-4 focus:ring-azul/15";

export function SelectField({
  label,
  hint,
  className,
  id,
  options,
  placeholder,
  ...select
}: ComponentProps<"select"> & { label: string; hint?: string; options: Record<string, string>; placeholder?: string }) {
  const selectId = id ?? select.name;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={selectId} className="text-sm font-semibold text-ink-800">
        {label}
      </label>
      <select id={selectId} className={cn(controlClass, "h-12")} {...select}>
        {placeholder && <option value="">{placeholder}</option>}
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function TextAreaField({ label, className, id, ...area }: ComponentProps<"textarea"> & { label: string }) {
  const areaId = id ?? area.name;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={areaId} className="text-sm font-semibold text-ink-800">
        {label}
      </label>
      <textarea id={areaId} className={cn(controlClass, "min-h-24 py-3")} {...area} />
    </div>
  );
}

export function CheckboxField({ label, className, id, ...input }: Omit<ComponentProps<"input">, "type"> & { label: ReactNode }) {
  const inputId = id ?? input.name;
  return (
    <label htmlFor={inputId} className={cn("flex items-start gap-3 text-sm text-ink-700", className)}>
      <input id={inputId} type="checkbox" className="mt-0.5 size-5 shrink-0 accent-azul" {...input} />
      <span>{label}</span>
    </label>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-xl bg-exito-100 px-4 py-3 text-sm font-semibold text-exito">
      {message}
    </p>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-alerta-100 px-4 py-3 text-sm font-semibold text-alerta">
      {message}
    </p>
  );
}

/* ---------- Corte del sistema gráfico (manual §12) ---------- */

/**
 * Banda inferior con el corte inclinado a 4.65° (sube hacia la derecha) y la grieta.
 * `from` es el color de arriba (lo da el contenedor), `to` el de abajo.
 */
export function Corte({
  to = "negro",
  grieta = "naranja",
  className,
}: {
  to?: "negro" | "azul" | "blanco";
  grieta?: "naranja" | "negro" | "azul";
  className?: string;
}) {
  const fill = { negro: "#09080D", azul: "#191BDF", blanco: "#FBFBFB" }[to];
  const crack = { naranja: "#FE6807", negro: "#09080D", azul: "#191BDF" }[grieta];
  // tan(4.65°) ≈ 0.0813 → en un ancho de 1000 sube 81.3 unidades.
  return (
    // Sin preserveAspectRatio="none": la proporción fija mantiene el ángulo exacto en cualquier ancho.
    <svg viewBox="0 0 1000 120" className={cn("block h-auto w-full", className)} aria-hidden>
      <polygon points="0,101.3 1000,20 1000,120 0,120" fill={fill} />
      <polygon points="0,101.3 1000,20 1000,30 0,111.3" fill={crack} />
    </svg>
  );
}

export function SampleBadge() {
  return (
    <span className="rounded-full border border-ink-300 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-ink-500">Datos de ejemplo</span>
  );
}
