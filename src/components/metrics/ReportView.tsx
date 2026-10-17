import { Chip } from "@/components/ui";
import { Bars, IndicatorCard, Ring } from "@/components/metrics/Charts";
import type { Cuenta, Explanation } from "@/lib/metrics/schemas";

const pctOf = (c: Cuenta, k: "reels" | "historias" | "publicaciones") => (c.pct_por_tipo as Record<string, number | null | undefined> | null | undefined)?.[k] ?? null;

/** El informe del mes en lenguaje sencillo: indicadores con flecha de cambio, anillos y barras de porcentaje, hallazgos y siguiente paso. */
export function ReportView({ explanation, cuenta, mock }: { explanation: Explanation; cuenta: Cuenta; mock: boolean }) {
  const noFollowers = typeof cuenta.pct_vistas_no_seguidores === "number" ? cuenta.pct_vistas_no_seguidores : null;
  const types = (["reels", "historias", "publicaciones"] as const).map((k) => ({ label: k === "reels" ? "Reels" : k === "historias" ? "Historias" : "Publicaciones", value: pctOf(cuenta, k) })).filter((x): x is { label: string; value: number } => typeof x.value === "number");

  return (
    <div className="flex flex-col gap-4">
      {mock && <p className="rounded-xl bg-naranja-100 p-3 text-xs text-ink-900">Datos de ejemplo: todavía no se leyeron capturas reales con la IA.</p>}
      <p className="rounded-card bg-azul-50 p-4 text-ink-900">{explanation.resumen}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {explanation.indicadores.map((i) => (
          <IndicatorCard key={i.id} etiqueta={i.etiqueta} valor={i.valor} change={i.cambio_pct} tone={i.tono} explicacion={i.explicacion} />
        ))}
      </div>

      {(noFollowers !== null || types.length > 0) && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {noFollowers !== null && (
            <div className="flex flex-col items-center gap-3 rounded-card bg-blanco p-5 shadow-card">
              <p className="self-start text-sm font-extrabold">¿A quién llegas?</p>
              <div className="flex gap-6">
                <Ring value={100 - noFollowers} label="Tus seguidores" />
                <Ring value={noFollowers} label="Gente nueva" color="#FE6807" />
              </div>
              <p className="text-xs text-ink-500">Mientras más gente nueva te ve, más crece tu audiencia.</p>
            </div>
          )}
          {types.length > 0 && (
            <div className="flex flex-col gap-3 rounded-card bg-blanco p-5 shadow-card">
              <p className="text-sm font-extrabold">¿Qué contenido se ve más?</p>
              <Bars title="Vistas por tipo de contenido" items={types} />
            </div>
          )}
        </div>
      )}

      {explanation.hallazgos.length > 0 && (
        <div className="flex flex-col gap-2 rounded-card bg-blanco p-5 shadow-card">
          <p className="text-sm font-extrabold">Lo que estamos aprendiendo</p>
          <ul className="flex flex-col gap-2 text-sm">
            {explanation.hallazgos.map((h, i) => (
              <li key={i} className="flex items-start gap-2">
                <Chip tone={h.tipo === "hipotesis" ? "naranja" : "azul"}>{h.tipo === "hipotesis" ? "Hipótesis" : "Dato"}</Chip>
                <span>{h.texto}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-500">Hasta tener unos 30 videos publicados, lo que “funciona” son hipótesis: las confirmamos con más datos.</p>
        </div>
      )}

      {explanation.para_la_parrilla.length > 0 && (
        <div className="rounded-card bg-blanco p-5 shadow-card">
          <p className="text-sm font-extrabold">Para tu próxima semana</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-ink-800">{explanation.para_la_parrilla.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
      {explanation.siguiente_paso && (
        <div className="rounded-card bg-azul p-5 text-blanco">
          <p className="text-xs text-azul-100">Tu siguiente paso</p>
          <p className="mt-1 font-semibold">{explanation.siguiente_paso}</p>
        </div>
      )}
      {explanation.mensaje && <p className="text-center text-sm italic text-ink-600">“{explanation.mensaje}”</p>}
    </div>
  );
}
