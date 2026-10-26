"use client";

import { useActionState, useState } from "react";
import { Button, FormError, FormSuccess } from "@/components/ui";
import { saveModelsAction, testModelAction, type AdminState } from "@/lib/admin/actions";
import type { ModelKind } from "@/lib/admin/model-test";

type Skill = { key: string; label: string };
type Models = { claude: string; geminiText: string; geminiMedia: string; geminiImage: string; geminiImagePro: string; routing: Record<string, "claude" | "gemini"> };
type Suggestions = { claude: readonly string[]; gemini: readonly string[]; image: readonly string[] };

function ModelField({ kind, label, hint, value, options, costs = false, optional = false }: { kind: ModelKind; label: string; hint: string; value: string; options: readonly string[]; costs?: boolean; optional?: boolean }) {
  const [test, testAction, testing] = useActionState<AdminState, FormData>(testModelAction, undefined);
  // Controlado: el formulario se limpia solo al enviarse y, si no, volvería al valor con el que cargó la página.
  const [val, setVal] = useState(value);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={kind} className="text-sm font-semibold text-ink-800">
        {label}
      </label>
      <div className="flex gap-2">
        <select id={kind} name={kind} value={val} onChange={(e) => setVal(e.target.value)} className="h-12 min-w-0 flex-1 rounded-xl border border-ink-300 bg-blanco px-3 text-base text-ink-900 outline-none focus:border-azul focus:ring-4 focus:ring-azul/15">
          {optional && <option value="">Igual que Básico</option>}
          {[...new Set([val, value, ...options])].filter(Boolean).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          variant="outline"
          formAction={(fd: FormData) => {
            fd.set("kind", kind);
            testAction(fd);
          }}
          disabled={testing}
          onClick={(e) => {
            if (costs && !confirm("Esta prueba crea una imagen real y cuesta unos centavos. ¿Continuar?")) e.preventDefault();
          }}
        >
          {testing ? "Probando…" : "Probar"}
        </Button>
      </div>
      <p className="text-xs text-ink-500">{hint}</p>
      {test?.message && (
        <p role="status" className="text-xs font-semibold text-exito">
          {test.message}
        </p>
      )}
      {test?.error && (
        <p role="alert" className="text-xs font-semibold text-alerta">
          {test.error}
        </p>
      )}
    </div>
  );
}

export function ModelsForm({ v, skills, suggestions }: { v: Models; skills: readonly Skill[]; suggestions: Suggestions }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveModelsAction, undefined);
  const [routing, setRouting] = useState(v.routing);
  return (
    <form action={action} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-card bg-blanco p-5 shadow-card">
        <div>
          <h2 className="text-sm font-extrabold">Modelos</h2>
          <p className="mt-1 text-xs text-ink-500">Elige el modelo de la lista (sale directo de cada proveedor, así solo ves los que sí puedes usar). “Probar” hace una llamada mínima para confirmar que existe y responde. Los cambios se aplican en unos segundos, también en el worker.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <ModelField kind="claude" label="Claude (escritura y edición con imágenes)" hint="Brújula, guiones, edición con imágenes, métricas y analizador. Es el más caro por uso." value={v.claude} options={suggestions.claude} />
          <ModelField kind="geminiText" label="Gemini para texto" hint="Para las skills que mandas primero a Gemini (tabla de abajo). Más barato." value={v.geminiText} options={suggestions.gemini} />
          <ModelField kind="geminiMedia" label="Gemini para audio, capturas y video" hint="Transcribe tu voz y los videos, lee capturas de métricas, analiza reels y revisa tu video (El Lente)." value={v.geminiMedia} options={suggestions.gemini} />
          <ModelField kind="geminiImage" label="Imágenes con IA (Básico)" hint="Crea las imágenes de los carruseles. Nano Banana: gemini-2.5-flash-image." value={v.geminiImage} options={suggestions.image} costs />
          <ModelField kind="geminiImagePro" label="Imágenes con IA (Pro)" hint="Opcional: un modelo más potente solo para el plan Pro, p. ej. Nano Banana Pro. Vacío = el mismo de Básico. Sube su precio en Límites y costos." value={v.geminiImagePro} options={suggestions.image} costs optional />
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-card bg-blanco p-5 shadow-card">
        <div>
          <h2 className="text-sm font-extrabold">Qué IA se usa primero en cada tarea</h2>
          <p className="mt-1 text-xs text-ink-500">La otra queda de respaldo: si la primera falla (sin créditos, límite de uso o respuesta inválida), la tarea se reintenta con la segunda. Gemini suele costar mucho menos; Claude escribe con más “voz”.</p>
        </div>
        <ul className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {skills.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-3">
              <label htmlFor={`route_${s.key}`} className="text-sm text-ink-800">
                {s.label}
              </label>
              <select id={`route_${s.key}`} name={`route_${s.key}`} value={routing[s.key] ?? "claude"} onChange={(e) => setRouting((r) => ({ ...r, [s.key]: e.target.value as "claude" | "gemini" }))} className="h-11 rounded-xl border border-ink-300 bg-blanco px-3 text-sm text-ink-900">
                <option value="claude">Claude primero</option>
                <option value="gemini">Gemini primero</option>
              </select>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-500">Tareas con IA fija (no se cambian aquí): transcribir audio, leer capturas, analizar videos y El Lente usan siempre Gemini; la edición con imágenes, las métricas y las ideas del analizador usan Claude (las ideas del analizador pasan a Gemini si Claude falla).</p>
      </section>

      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Guardar modelos"}
      </Button>
    </form>
  );
}
