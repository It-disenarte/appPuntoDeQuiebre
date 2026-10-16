// Contenido de la Brújula de marca (fase 2 del arranque).
// PROPUESTA editable: si cambian los campos o las opciones, sube BRUJULA_VERSION.
import { z } from "zod";

export const BRUJULA_VERSION = "2026-10-v1";

export type Option = { value: string; label: string };
export type FieldKind = "text" | "textarea" | "select" | "multi" | "number";
export type FieldDef = {
  id: string;
  label: string;
  hint?: string;
  kind: FieldKind;
  options?: Option[];
  required?: boolean;
  max?: number;
  maxChoices?: number;
  placeholder?: string;
};
export type BlockDef = { id: string; title: string; intro: string; minutes: number; fields: FieldDef[] };
export type AnswerValue = string | string[];
export type Answers = Record<string, Record<string, AnswerValue>>;

const o = (...pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));

export const BLOCKS: BlockDef[] = [
  {
    id: "quien",
    title: "Quién eres",
    intro: "Para que tu contenido suene a ti, empezamos por conocerte.",
    minutes: 2,
    fields: [
      { id: "displayName", label: "¿Cómo quieres que te conozcan?", hint: "Tu nombre o el nombre de tu marca.", kind: "text", required: true, max: 80 },
      { id: "profession", label: "¿A qué te dedicas hoy?", kind: "text", required: true, max: 120, placeholder: "Ej. Ingeniera agrónoma, barbero, nutrióloga…" },
      { id: "story", label: "¿Por qué quieres crear contenido?", hint: "Cuéntalo en 2 o 3 frases, como se lo dirías a un amigo.", kind: "textarea", required: true, max: 600 },
    ],
  },
  {
    id: "audiencia",
    title: "A quién ayudas",
    intro: "Tu contenido es para alguien en concreto. Mientras más claro, mejor funciona.",
    minutes: 2,
    fields: [
      { id: "audience", label: "¿Quién es tu persona ideal?", kind: "text", required: true, max: 200, placeholder: "Ej. Personas que empiezan un huerto en casa" },
      { id: "pain", label: "¿Qué problema principal le ayudas a resolver?", kind: "textarea", required: true, max: 600 },
      {
        id: "feeling",
        label: "¿Qué quieres que sienta al verte?",
        kind: "select",
        required: true,
        options: o(["confianza", "Confianza"], ["inspiracion", "Inspiración"], ["diversion", "Diversión"], ["curiosidad", "Curiosidad"], ["calma", "Calma"]),
      },
    ],
  },
  {
    id: "percepcion",
    title: "Cómo quieres ser percibido",
    intro: "Elige la personalidad que quieres que vea tu audiencia.",
    minutes: 2,
    fields: [
      {
        id: "traits",
        label: "Elige hasta 3 palabras que te describan en cámara",
        kind: "multi",
        required: true,
        maxChoices: 3,
        options: o(
          ["cercano", "Cercano"],
          ["experto", "Experto"],
          ["divertido", "Divertido"],
          ["directo", "Directo"],
          ["inspirador", "Inspirador"],
          ["elegante", "Elegante"],
          ["autentico", "Auténtico"],
          ["atrevido", "Atrevido"],
        ),
      },
      {
        id: "tone",
        label: "¿Cómo hablas normalmente?",
        kind: "select",
        required: true,
        options: o(["amigo", "Como con un amigo, relajado"], ["profesional", "Claro y profesional"], ["humor", "Con humor"], ["energia", "Con energía y motivación"]),
      },
      { id: "avoid", label: "¿Qué NO quieres que digan de ti?", hint: "Opcional.", kind: "text", max: 200 },
    ],
  },
  {
    id: "nicho",
    title: "Nicho e intereses",
    intro: "De qué vas a hablar la mayor parte del tiempo.",
    minutes: 2,
    fields: [
      { id: "niche", label: "¿Cuál es tu nicho?", kind: "text", required: true, max: 120, placeholder: "Ej. Huertos urbanos" },
      { id: "interests", label: "Escribe de 3 a 5 temas que te apasionan", hint: "Separados por coma o uno por línea.", kind: "textarea", required: true, max: 400 },
      { id: "taboo", label: "Temas que prefieres no tocar", hint: "Opcional.", kind: "text", max: 200 },
    ],
  },
  {
    id: "objetivo",
    title: "Objetivo",
    intro: "Lo que quieres lograr con tu marca personal.",
    minutes: 2,
    fields: [
      {
        id: "goal",
        label: "¿Qué quieres lograr principalmente?",
        kind: "select",
        required: true,
        options: o(
          ["clientes", "Conseguir clientes para mi negocio o servicio"],
          ["producto", "Vender un producto propio"],
          ["marca", "Construir mi marca personal"],
          ["comunidad", "Crear una comunidad"],
          ["ingresos", "Generar ingresos con mi contenido"],
        ),
      },
      { id: "hasOffer", label: "¿Tienes algo que vender?", kind: "select", required: true, options: o(["si", "Sí, ya vendo algo"], ["pronto", "Todavía no, pero pronto"], ["no", "No por ahora"]) },
      { id: "offer", label: "¿Qué vendes o venderás?", hint: "Opcional.", kind: "text", max: 200 },
      { id: "followers", label: "¿Cuántos seguidores tienes hoy en total?", hint: "Escribe 0 si estás empezando.", kind: "number", required: true },
    ],
  },
  {
    id: "formatos",
    title: "Formatos y referentes",
    intro: "Cómo te gusta crear y a quién admiras.",
    minutes: 2,
    fields: [
      {
        id: "formats",
        label: "¿Qué formatos prefieres? (hasta 4)",
        kind: "multi",
        required: true,
        maxChoices: 4,
        options: o(
          ["camara", "Hablando a cámara"],
          ["tutorial", "Tutoriales paso a paso"],
          ["historia", "Contar historias"],
          ["detras", "Detrás de cámaras"],
          ["humor", "Humor o sketches"],
          ["opinion", "Opinión y debate"],
          ["carrusel", "Carruseles"],
        ),
      },
      { id: "refs", label: "Cuentas que te inspiran o competidores", hint: "Hasta 3, una por línea (@usuario). Opcional.", kind: "textarea", max: 300 },
    ],
  },
];

export const BLOCK_IDS = BLOCKS.map((b) => b.id);
export const getBlock = (id: string) => BLOCKS.find((b) => b.id === id) ?? null;

const MSG = {
  required: "Completa este campo para continuar.",
  invalid: "Elige una de las opciones.",
  number: "Escribe un número, por ejemplo 0.",
};

/** Construye el esquema de validación de un bloque a partir de su definición. */
export function blockSchema(block: BlockDef) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of block.fields) {
    const max = f.max ?? (f.kind === "textarea" ? 600 : 200);
    switch (f.kind) {
      case "text":
      case "textarea": {
        const base = z.string().trim().max(max, `Máximo ${max} caracteres.`);
        shape[f.id] = f.required ? base.min(1, MSG.required) : base.optional().default("");
        break;
      }
      case "select": {
        const values = f.options!.map((x) => x.value);
        const base = z.string().refine((v) => values.includes(v), MSG.invalid);
        shape[f.id] = f.required ? base : base.or(z.literal("")).optional().default("");
        break;
      }
      case "multi": {
        const values = f.options!.map((x) => x.value);
        let arr = z.array(z.string().refine((v) => values.includes(v), MSG.invalid)).max(f.maxChoices ?? values.length, `Elige máximo ${f.maxChoices}.`);
        if (f.required) arr = arr.min(1, "Elige al menos una opción.");
        shape[f.id] = arr;
        break;
      }
      case "number":
        shape[f.id] = z
          .string()
          .trim()
          .regex(/^\d{1,9}$/, MSG.number);
        break;
    }
  }
  return z.object(shape);
}

/** Lee el FormData de un bloque en un objeto plano (los campos múltiples como arreglo). */
export function readBlockForm(block: BlockDef, fd: FormData): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const f of block.fields) {
    if (f.kind === "multi") out[f.id] = fd.getAll(f.id).filter((v): v is string => typeof v === "string");
    else {
      const v = fd.get(f.id);
      out[f.id] = typeof v === "string" ? v : "";
    }
  }
  return out;
}

export type Stage = "arranque" | "crecimiento" | "monetizacion";

/** Etapa del creador según sus seguidores y si tiene algo que vender (reglas del motor, guía de Luis). */
export function creatorStage(followers: number, hasOffer: string): Stage {
  if (followers > 10_000 || (hasOffer === "si" && followers >= 1_000)) return "monetizacion";
  if (followers >= 1_000) return "crecimiento";
  return "arranque";
}

export const STAGE_LABEL: Record<Stage, string> = {
  arranque: "Arranque",
  crecimiento: "Crecimiento",
  monetizacion: "Monetización",
};

export function str(a: Answers, block: string, field: string): string {
  const v = a[block]?.[field];
  return typeof v === "string" ? v : "";
}
export function list(a: Answers, block: string, field: string): string[] {
  const v = a[block]?.[field];
  return Array.isArray(v) ? v : [];
}
export function optionLabel(blockId: string, fieldId: string, value: string): string {
  return getBlock(blockId)?.fields.find((f) => f.id === fieldId)?.options?.find((x) => x.value === value)?.label ?? value;
}
