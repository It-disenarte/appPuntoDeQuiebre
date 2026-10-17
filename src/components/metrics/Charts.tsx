import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";
import { cn } from "@/components/ui";

/** Anillo de porcentaje (SVG, sin librerías). */
export function Ring({ value, label, color = "#191BDF", size = 96 }: { value: number; label: string; color?: string; size?: number }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <figure className="m-0 flex flex-col items-center gap-1.5">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${label}: ${Math.round(v)} %`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E4E3EA" strokeWidth="11" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 50 50)" />
        <text x="50" y="56" textAnchor="middle" fontSize="22" fontWeight="800" fill="#09080D">
          {Math.round(v)}%
        </text>
      </svg>
      <figcaption className="text-center text-xs font-semibold text-ink-700">{label}</figcaption>
    </figure>
  );
}

/** Barras horizontales con porcentaje. */
export function Bars({ items, title }: { items: { label: string; value: number; color?: string }[]; title: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div role="img" aria-label={title} className="flex flex-col gap-2">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 text-ink-700">{i.label}</span>
          <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink-200">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (i.value / max) * 100)}%`, background: i.color ?? "#191BDF" }} />
          </span>
          <span className="w-10 text-right font-semibold">{Math.round(i.value)}%</span>
        </div>
      ))}
    </div>
  );
}

/** Mini gráfica de una cifra a lo largo de los meses. */
export function Spark({ points, label }: { points: { label: string; value: number }[]; label: string }) {
  if (points.length < 2) return null;
  const w = 240;
  const h = 60;
  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(...points.map((p) => p.value));
  const span = Math.max(1, max - min);
  const xy = points.map((p, i) => [(i / (points.length - 1)) * (w - 16) + 8, h - 10 - ((p.value - min) / span) * (h - 20)] as const);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={label}>
      <polyline points={xy.map((p) => p.join(",")).join(" ")} fill="none" stroke="#191BDF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === xy.length - 1 ? 5 : 3} fill={i === xy.length - 1 ? "#FE6807" : "#191BDF"} />
      ))}
    </svg>
  );
}

const TONE_STYLE = {
  sube: { cls: "bg-exito-100 text-exito", Icon: ArrowUpRight, word: "subió" },
  baja: { cls: "bg-alerta-100 text-alerta", Icon: ArrowDownRight, word: "bajó" },
  igual: { cls: "bg-ink-100 text-ink-700", Icon: Minus, word: "igual" },
  nuevo: { cls: "bg-azul-50 text-azul", Icon: Sparkles, word: "primer dato" },
} as const;

export function DeltaChip({ change, tone }: { change: number | null; tone: keyof typeof TONE_STYLE }) {
  const t = TONE_STYLE[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", t.cls)}>
      <t.Icon className="size-3.5" aria-hidden />
      {change === null ? t.word : tone === "igual" ? "igual" : `${change > 0 ? "+" : ""}${change} %`}
    </span>
  );
}

export function IndicatorCard({ etiqueta, valor, change, tone, explicacion }: { etiqueta: string; valor: string; change: number | null; tone: keyof typeof TONE_STYLE; explicacion?: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-card bg-blanco p-4 shadow-card">
      <p className="text-xs text-ink-500">{etiqueta}</p>
      <p className="font-display text-3xl">{valor}</p>
      <DeltaChip change={change} tone={tone} />
      {explicacion && <p className="text-xs text-ink-600">{explicacion}</p>}
    </div>
  );
}
