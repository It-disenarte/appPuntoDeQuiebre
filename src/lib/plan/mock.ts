// Versión de PRUEBA de las skills de la parrilla (reglas, sin IA). Respeta los esquemas reales; el texto es tosco a propósito
// y siempre se marca como "de prueba". Con ANTHROPIC_API_KEY las skills reales (Claude) la reemplazan.
import type { HistoriasV2, ParrillaV1, TextosV2 } from "@/lib/skills/schemas";
import { DAY_CODES, type Category } from "./rules";

type Pilar = { nombre: string; descripcion: string; categoria_dominante: string; ideas_de_tema: string[] };
export type BrujulaLite = { nicho?: { principal: string }; pilares: Pilar[]; palabras_si: string[]; palabras_no: string[]; postura?: string; lives?: { hace_lives: boolean } };
export type VozLite = { frases_firma: string[]; como_aconseja: string; preferencias_aprendidas: unknown[] };

export type ParrillaInput = {
  creador_id: string;
  brujula: BrujulaLite & Record<string, unknown>;
  perfil_voz: VozLite & Record<string, unknown>;
  semana: { n: number; dia: string; formato: "video" | "carrusel"; categoria: Category; tipo: "probado" | "prueba"; variante_de: number | null; prueba: "gancho" | "angulo" | null }[];
  temas_recientes: string[];
  enfoque: string | null;
  /** Ideas que el creador guardó (p. ej. del analizador de competencia) para que sean la base de algún guion. */
  ideas_guardadas?: { titulo: string; gancho: string; idea: string; guion_corto: string | null; inspirada_en: string | null }[];
};

export type TextosInput = {
  creador_id: string;
  pieza: { tipo: "reel" | "carrusel" | "foto"; guion: string; pilar: string; categoria: Category; redes: string[] };
  brujula: Record<string, unknown> & { palabras_si?: string[]; palabras_no?: string[] };
  perfil_voz: Record<string, unknown>;
  historial_hashtags: string[];
  modo: "aprendizaje" | "rapido";
};

export type HistoriasInput = {
  creador_id: string;
  brujula: BrujulaLite;
  perfil_voz: VozLite;
  horario: { bloques: { tipo: string; dia: string | null }[] };
  parrilla_semana: { dia: string; tipo: "reel" | "carrusel"; tema: string; publica: string }[];
  historial: { tipo: string; le_gusto: boolean }[];
  enfoque_semana: { temas: string[]; tipos_apagados: { tipo: string; hasta: string }[] };
};

const CLOSE: Record<Category, string> = {
  viral: "Guárdalo y compártelo con alguien que lo necesite.",
  nicho: "Cuéntame en los comentarios cómo te va a ti.",
  conversion: "Escríbeme por mensaje directo y te cuento cómo te ayudo.",
};

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/* ───────────── Parrilla y guiones ───────────── */

export function mockParrilla(i: ParrillaInput): ParrillaV1 {
  const pilares = i.brujula.pilares.length ? i.brujula.pilares : [{ nombre: "Mi historia", descripcion: "Tu camino", categoria_dominante: "nicho", ideas_de_tema: ["Cómo empecé"] }];
  const recent = new Set(i.temas_recientes.map((t) => t.toLowerCase()));
  const used = new Map<number, number>();
  const byN = new Map<number, { pilar: Pilar; tema: string }>();
  let last = -1;

  const piezas = i.semana.map((s) => {
    let pilar: Pilar;
    let tema: string;
    if (s.variante_de !== null && byN.has(s.variante_de)) {
      ({ pilar, tema } = byN.get(s.variante_de)!);
    } else {
      let idx = (last + 1) % pilares.length;
      // Los pilares de la categoría dominante tienen prioridad; sin repetir el mismo en días seguidos.
      const pref = pilares.findIndex((p, k) => k !== last && p.categoria_dominante === s.categoria && (used.get(k) ?? 0) <= (used.get(idx) ?? 0));
      if (pref >= 0 && pilares.length > 1) idx = pref;
      if (idx === last && pilares.length > 1) idx = (idx + 1) % pilares.length;
      pilar = pilares[idx]!;
      const ideas = pilar.ideas_de_tema.length ? pilar.ideas_de_tema : [pilar.nombre];
      const turn = used.get(idx) ?? 0;
      let k = turn % ideas.length;
      for (let tries = 0; tries < ideas.length && recent.has(ideas[k]!.toLowerCase()); tries++) k = (k + 1) % ideas.length;
      tema = ideas[k]!;
      used.set(idx, turn + 1);
      last = idx;
      byN.set(s.n, { pilar, tema });
    }
    const ideaBase = `${pilar.descripcion}`;
    const base = {
      n: s.n,
      pilar: pilar.nombre,
      tema: clip(tema, 60),
      idea: clip(ideaBase, 180),
    };
    if (s.formato === "carrusel") {
      return { ...base, guion: { titulo: clip(tema, 60), idea_central: clip(ideaBase, 140), puntos: [`Qué es ${tema.toLowerCase()}`, "El error más común", "Cómo empezar hoy", "Lo que yo haría"], cierre: CLOSE[s.categoria] }, variante: null, tarjeta_prueba: null };
    }
    const isVariant = s.tipo === "prueba";
    return {
      ...base,
      guion: {
        gancho: `¿Te pasa esto con ${tema.toLowerCase()}?`,
        cuerpo: [clip(ideaBase, 110), "Lo que yo aprendí es empezar chiquito.", "Y hacerlo paso a paso, sin miedo a equivocarte."],
        cierre: CLOSE[s.categoria],
        duracion_segundos: 35,
        nota_grabacion: "Frente a cámara, a la altura de los ojos y con luz de frente.",
      },
      variante: isVariant ? { gancho_b: s.prueba === "gancho" ? `Nadie te cuenta esto de ${tema.toLowerCase()}.` : null, angulo_b: s.prueba === "angulo" ? "Grábalo en otro lugar de tu casa, con otro encuadre." : null } : null,
      tarjeta_prueba: isVariant ? (s.prueba === "gancho" ? "Probamos dos ganchos distintos en el mismo video para ver cuál engancha más." : "Probamos el mismo guion en otro lugar o encuadre para ver cuál funciona mejor.") : null,
    };
  });
  return { skill_version: "parrilla-guiones-v2", resumen_semana: "Esta semana trabajamos tus pilares con un video de prueba al final (versión de prueba).", piezas } as ParrillaV1;
}

/* ───────────── Textos de publicación ───────────── */

export function mockTextos(i: TextosInput): TextosV2 {
  const first = i.pieza.guion.split(/(?<=[.!?¿?])\s+/)[0]?.trim() || i.pieza.pilar;
  const hooks = [clip(first, 120), clip(`Esto te sirve si ${i.pieza.pilar.toLowerCase()} te cuesta.`, 120), clip(`${i.pieza.pilar}: lo que nadie te dice.`, 120)];
  const tags = (i.brujula.palabras_si ?? []).slice(0, 4).map((w) => `#${w.replace(/\s+/g, "").normalize("NFD").replace(/[̀-ͯ]/g, "")}`).filter((t) => t.length > 2);
  const hashtags = tags.length >= 3 ? tags : [...tags, "#empezar", "#aprender", "#paso a paso".replace(/\s+/g, "")].slice(0, 4);
  const cta = CLOSE[i.pieza.categoria];
  const body = i.pieza.guion.length > 260 ? `${i.pieza.guion.slice(0, 257).trimEnd()}…` : i.pieza.guion;
  const out: TextosV2 = {
    skill_version: "textos-publicacion-v2",
    ganchos: hooks,
    gancho_elegido: 0,
    datos_a_verificar: [],
  };
  if (i.pieza.redes.includes("instagram")) out.instagram = { texto: `${hooks[0]}\n\n${body}\n\n${cta}`, hashtags: hashtags.slice(0, 5), primer_comentario: null, caracteres: hooks[0]!.length };
  if (i.pieza.redes.includes("tiktok")) out.tiktok = { texto: clip(`${hooks[0]} ${cta}`, 290), hashtags: hashtags.slice(0, 4), texto_en_pantalla: clip(hooks[0]!, 50) };
  if (i.pieza.redes.includes("facebook")) out.facebook = { texto: `${hooks[0]}\n\n${body}\n\n¿Y tú, qué opinas?`, hashtags: hashtags.slice(0, 2) };
  return out;
}

/* ───────────── Ideas de historias ───────────── */

/** Biblioteca fija de tipos (skill 7, sección 2). */
export const STORY_LIBRARY = [
  { tipo: "Detrás de cámaras", sticker: null, text: "Muestra cómo te preparas para grabar." },
  { tipo: "Nuevo reel", sticker: "Enlace o mención al reel", text: "Avisa que ya salió tu nuevo reel." },
  { tipo: "Encuesta", sticker: "Encuesta", text: "Pregunta a tu comunidad qué tema quieren ver." },
  { tipo: "Esto o aquello", sticker: "Encuesta", text: "Dos opciones de tu nicho para que elijan." },
  { tipo: "Caja de preguntas", sticker: "Preguntas", text: "Invita a que te pregunten algo de tu nicho." },
  { tipo: "Slider de emoji", sticker: "Barra deslizante", text: "¿Qué tanto te gusta…? Que lo califiquen." },
  { tipo: "Dato curioso", sticker: null, text: "Comparte un dato corto que complemente tu último reel." },
  { tipo: "Recomendación", sticker: null, text: "Recomienda algo que lees, escuchas o usas." },
  { tipo: "Mi día en 3 fotos", sticker: null, text: "Resume tu día en tres fotos." },
  { tipo: "Reaccionar a un comentario", sticker: null, text: "Responde un comentario de tu último reel." },
  { tipo: "Cuenta regresiva", sticker: "Cuenta regresiva", text: "Anuncia tu próximo live." },
] as const;

export function mockHistorias(i: HistoriasInput, ownIdeaDow = 5): HistoriasV2 {
  const off = new Set(i.enfoque_semana.tipos_apagados.map((t) => t.tipo));
  const lib = STORY_LIBRARY.filter((t) => !off.has(t.tipo));
  const byDay = new Map(i.parrilla_semana.map((p) => [p.dia, p]));
  const recording = new Set(i.horario.bloques.filter((b) => b.dia).map((b) => b.dia as string));
  const temas = i.enfoque_semana.temas;
  const nicho = i.brujula.nicho?.principal ?? "tu nicho";
  const stickerTypes = ["Encuesta", "Caja de preguntas", "Slider de emoji", "Esto o aquello"];
  let prev = "";
  let stickers = 0;

  const semana = DAY_CODES.map((code, idx) => {
    if (idx === ownIdeaDow) return { dia: code, tipo: "idea_propia", idea: "Hoy la idea es tuya: ¿qué vas a mostrar, qué vas a decir o preguntar y usarías un sticker?", texto_sugerido: "", sticker: null, minutos: 3, tema_enfoque: null, alternativas: [] };
    const pick = (t: string) => lib.find((x) => x.tipo === t) ?? lib[idx % lib.length]!;
    let choice = pick(byDay.has(code) && byDay.get(code)!.tipo === "reel" ? "Nuevo reel" : recording.has(code) ? "Detrás de cámaras" : stickerTypes[(idx + stickers) % stickerTypes.length]!);
    if (choice.tipo === prev) choice = lib.find((x) => x.tipo !== prev && stickerTypes.includes(x.tipo)) ?? lib[(idx + 1) % lib.length]!;
    if (choice.sticker) stickers += 1;
    prev = choice.tipo;
    const tema = temas.length && idx % 2 === 0 ? temas[(idx / 2) % temas.length] ?? null : null;
    const alt = lib.filter((x) => x.tipo !== choice.tipo).slice(0, 6).map((x) => ({ tipo: x.tipo, idea: x.text, texto_sugerido: "", sticker: x.sticker }));
    return {
      dia: code,
      tipo: choice.tipo,
      idea: tema ? `${choice.text} Con el tema de la semana: ${tema}.` : `${choice.text} (${nicho})`,
      texto_sugerido: "",
      sticker: choice.sticker,
      minutos: 3,
      tema_enfoque: tema,
      alternativas: alt,
    };
  });
  return { skill_version: "ideas-historias-v2", temas_boton: i.brujula.pilares.slice(0, 4).map((p) => clip(p.nombre, 28)), semana } as HistoriasV2;
}
