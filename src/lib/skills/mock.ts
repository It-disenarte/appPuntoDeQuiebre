// Respuestas de PRUEBA de las skills (reglas, sin IA). Respetan el esquema real de Mishell para que las pantallas,
// el PDF y las validaciones sean los definitivos; el contenido es tosco a propósito y siempre se marca como "de prueba".
import { labelOf, TONES, type Quick, type Story } from "@/lib/brujula/content";
import { analyzeVoice } from "@/lib/brujula/voice";
import type { BrujulaV2, PerfilVozV1 } from "./schemas";

/* ───────────── Entradas de las skills (según el skill.md de cada una) ───────────── */

export type MuestraVoz = {
  calentamiento: string;
  por_que_empezaste: string;
  que_te_molesta: string;
  mayor_orgullo: string;
  a_quien_le_hablas: string;
  historia: { eleccion: string; texto: string };
  que_vendes: string;
  preguntas_saltadas: string[];
};

export type BrujulaInput = {
  creador_id: string;
  nombre: string;
  auditoria: { modo: "sin_contenido" } & Record<string, unknown>;
  respuestas_tarjetas: { id: string; texto: string; respuesta: "si" | "no" | "ajustar"; nota: string | null }[];
  muestra_voz: MuestraVoz;
  elecciones_rapidas: Quick;
  kit_visual: Record<string, unknown> | null;
  /** Campo agregado (la skill no lo define aún): lo que el creador pidió cambiar en una sección del manual. */
  ajuste?: { seccion: string; voto: "ajustar" | "no"; nota: string; manual_actual: unknown };
};

export type PerfilVozInput = {
  creador_id: string;
  muestra_voz: MuestraVoz;
  brujula: { tono: BrujulaV2["tono"]; palabras_si: string[]; palabras_no: string[] };
  transcripciones_videos?: string[];
};

const text = (a: Story["steps"][keyof Story["steps"]]) => (a && !a.skipped ? a.text : "");

/** Arma la `muestra_voz` de la skill a partir de lo que respondió el creador. */
export function buildMuestraVoz(story: Story): MuestraVoz {
  const skipped = Object.entries(story.steps)
    .filter(([, v]) => v?.skipped)
    .map(([k]) => k);
  return {
    calentamiento: text(story.steps.calentamiento),
    por_que_empezaste: text(story.steps.por_que_empezaste),
    que_te_molesta: text(story.steps.que_te_molesta),
    mayor_orgullo: text(story.steps.mayor_orgullo),
    a_quien_le_hablas: text(story.steps.a_quien_le_hablas),
    historia: { eleccion: story.storyChoice ?? "", texto: text(story.steps.historia) },
    que_vendes: story.sell ? (story.sell.mode === "no" ? "no por ahora" : `${story.sell.mode === "hoy" ? "sí, hoy" : "más adelante"}${story.sell.text ? `: ${story.sell.text}` : ""}`) : "",
    preguntas_saltadas: skipped,
  };
}

/* ───────────── Texto ───────────── */

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const sentences = (s: string) =>
  s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 12);
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const pad = <T>(arr: T[], filler: T[], n: number) => [...new Set([...arr, ...filler])].slice(0, n);

/* ───────────── Brújula v2 (prueba) ───────────── */

export function mockBrujulaV2(input: BrujulaInput): BrujulaV2 {
  const m = input.muestra_voz;
  const corpus = [m.calentamiento, m.por_que_empezaste, m.que_te_molesta, m.mayor_orgullo, m.a_quien_le_hablas, m.historia.texto].join(" ");
  const stats = analyzeVoice(corpus, null);
  const vocab = stats.vocabulary;
  const q = input.elecciones_rapidas;
  const tono = q.tono.map((t) => labelOf([...TONES], t).replace(/\/a$/, "").toLowerCase());
  const sellsToday = m.que_vendes.startsWith("sí");
  const sellsLater = m.que_vendes.startsWith("más adelante");
  const hace_lives = q.formatos.includes("en_vivo");

  const pains = sentences(m.que_te_molesta);
  const prides = sentences(m.mayor_orgullo);
  const topics = pad(vocab.map(cap), ["Mi historia", "Errores comunes", "Paso a paso"], 3);
  const pilares = topics.map((nombre, i) => ({
    nombre,
    descripcion: `Contenido sobre ${nombre.toLowerCase()} desde tu experiencia (versión de prueba).`,
    categoria_dominante: (i === 0 ? "nicho" : "viral") as "nicho" | "viral" | "conversion",
    ideas_de_tema: [`Lo que nadie te cuenta de ${nombre.toLowerCase()}`, `Mi error más grande con ${nombre.toLowerCase()}`, `${nombre} en 3 pasos`],
  }));
  if (sellsToday) {
    pilares.push({ nombre: "Lo que ofrezco", descripcion: "Cómo puedo ayudarte con lo que vendo.", categoria_dominante: "conversion", ideas_de_tema: ["Qué incluye", "Para quién es", "Preguntas frecuentes"] });
  }

  return {
    skill_version: "brujula-v2",
    nicho: { principal: vocab.length >= 2 ? `${cap(vocab[0]!)} y ${vocab[1]}` : "Tu nicho (por definir)", enfoque: clip(sentences(m.calentamiento)[0] ?? "Por definir con más información", 140) },
    publico: {
      descripcion: clip(sentences(m.a_quien_le_hablas)[0] ?? "Personas que empiezan y no saben por dónde", 160),
      rango_edad: "18 a 35 (estimado; se confirma con las estadísticas de tu cuenta)",
      dolores: pad(pains.map((p) => clip(p, 90)), ["No saben por dónde empezar", "Les da miedo equivocarse", "Se frustran y lo dejan"], 3),
      deseos: pad(prides.map((p) => clip(p, 90)), ["Empezar con confianza", "Ver resultados reales", "Sentirse acompañados"], 3),
    },
    propuesta_valor: vocab[0] ? `Te acompaño a empezar con ${vocab[0]} sin complicarte y sin miedo a equivocarte.` : "Te acompaño a empezar sin complicarte y sin miedo a equivocarte.",
    frase_de_marca: "Empieza chiquito, pero empieza",
    pilares,
    tono: { adjetivos: pad(tono, ["auténtico", "cercano", "claro"], 3), descripcion: `Habla de forma ${tono.join(", ") || "cercana"}, con ejemplos de su propia experiencia (versión de prueba).` },
    palabras_si: pad(vocab, ["empezar", "paso a paso", "aprender", "proceso", "juntos"], 8).slice(0, 8),
    palabras_no: ["perfecto", "fácil y rápido", "truco viral"],
    postura: clip(`Cree en enseñar el proceso real, con sus errores. ${pains[0] ?? ""}`.trim(), 220),
    puente: null,
    vision: {
      hoy: clip(sentences(m.calentamiento)[0] ?? "Compartir lo que sabe y aprende", 140),
      despues: sellsLater ? clip(m.que_vendes.replace(/^más adelante:?\s*/, "") || "Ofrecer un producto o servicio propio", 140) : "Seguir creciendo su marca personal",
    },
    estilo_grabacion: {
      formato_principal: q.formatos[0] ?? "frente_a_camara",
      descripcion: `Formato principal: ${labelOf([{ value: "frente_a_camara", label: "frente a cámara" }, { value: "voz_en_off_con_clips", label: "voz en off con clips" }, { value: "frase_en_pantalla", label: "frase en pantalla" }, { value: "manos", label: "solo manos" }, { value: "entrevista_podcast", label: "entrevista o podcast" }, { value: "en_vivo", label: "en vivo" }], q.formatos[0] ?? "")}; los demás quedan de apoyo.`,
    },
    lives: { hace_lives, plataforma: null, frecuencia: null },
    kit_visual_ref: "kit-visual-v1",
    mensaje_al_creador: "Ya tenemos una primera versión de tu brújula. Revísala sección por sección y dinos qué cambiarías.",
    datos_faltantes: [
      "Esta es una versión de prueba generada con reglas, no con IA",
      "Edad y ciudades de tu audiencia (se toman de tus estadísticas al conectar Instagram)",
      ...(hace_lives ? ["¿En qué plataforma y cada cuánto haces lives?"] : []),
    ],
  };
}

/** Ajuste de una sección (prueba): conserva el manual y registra la nota en la sección pedida. */
export function mockApplyAdjustment(current: BrujulaV2, section: string, nota: string): BrujulaV2 {
  const note = clip(nota, 120);
  const next = structuredClone(current);
  switch (section) {
    case "nicho":
      next.nicho.enfoque = `${next.nicho.enfoque} · Ajuste pedido: ${note}`;
      break;
    case "publico":
      next.publico.descripcion = `${next.publico.descripcion} · Ajuste pedido: ${note}`;
      break;
    case "pilares":
      next.pilares[0]!.descripcion = `${next.pilares[0]!.descripcion} · Ajuste pedido: ${note}`;
      break;
    case "tono":
      next.tono.descripcion = `${next.tono.descripcion} · Ajuste pedido: ${note}`;
      break;
    default:
      next.postura = `${next.postura} · Ajuste pedido: ${note}`;
  }
  return next;
}

/* ───────────── Perfil de voz v1 (prueba) ───────────── */

export function mockPerfilVozV1(input: PerfilVozInput, durationSeconds: number | null): PerfilVozV1 {
  const m = input.muestra_voz;
  const corpus = [m.calentamiento, m.por_que_empezaste, m.que_te_molesta, m.mayor_orgullo, m.a_quien_le_hablas, m.historia.texto].join(" ");
  const s = analyzeVoice(corpus, durationSeconds);
  const no = new Set(input.brujula.palabras_no.map((p) => p.toLowerCase()));
  const long = s.sentenceLength >= 18;
  return {
    skill_version: "perfil-voz-v1",
    formalidad: long ? 3 : 2,
    energia: s.exclamations >= 4 ? "Alta; usa exclamaciones y acelera cuando algo la emociona" : "Tranquila y cálida; sube la energía en las conclusiones",
    ritmo: long ? "Frases largas unidas con 'y' y 'entonces'; en guion se cortan en frases cortas" : "Frases cortas y directas, fáciles de decir en voz alta",
    estructura_tipica: ["Empieza con algo suyo o un ejemplo concreto", "Lo convierte en una lección para todos", "Cierra con una frase corta"],
    palabras_frecuentes: s.vocabulary.filter((w) => !no.has(w)),
    muletillas: s.fillers.map((f) => ({ texto: f.word, uso: "Con medida: máximo 1 por guion" })),
    frases_firma: [],
    como_aconseja: s.secondPerson >= 6 ? "Directo y en segunda persona, como amiga que ya pasó por ahí" : "Desde su experiencia, sin dar órdenes",
    humor: "Se ríe de sus propios errores",
    recursos: ["Ejemplos concretos de su vida", "Cierres de una sola frase"],
    evitar: ["Groserías", "Tono de gurú o de regaño", "Tecnicismos sin explicar", ...input.brujula.palabras_no.map((p) => `Palabra: ${p}`)],
    ejemplo: { generico: "Es importante ser constante para ver resultados.", en_su_voz: "Empieza chiquito, equivócate rápido y sigue: de ahí se aprende." },
    reglas_para_guiones: ["Máximo 1 frase firma por guion", "Frases cortas para decirse en voz alta", "Siempre un dato o acción concreta", "Cierre de una sola frase"],
    preferencias_aprendidas: [],
  };
}
