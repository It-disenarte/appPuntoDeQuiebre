// Versión de PRUEBA de la skill kit-visual-v1 (reglas, sin IA). Respeta los esquemas reales; el gusto es tosco a propósito.
// Con ANTHROPIC_API_KEY la skill real (Claude) la reemplaza sin tocar las pantallas.
import { inkOn, mix } from "./contrast";
import { FONT_PAIRS } from "./fonts";
import type { FinalKit, FontOption, PaletteOption, PieceId, TitleOption } from "./schemas";
import { ELEMENT_IDS } from "./schemas";

export type KitInput = {
  modo: "ronda" | "final";
  numero_ronda: number;
  creador_id: string;
  auditoria: Record<string, unknown> | null;
  respuestas_tarjetas: unknown[];
  tono_elegido: string[];
  gancho_muestra: string;
  elecciones_previas: { ronda: number; eligio: string; opcion: unknown }[];
  calificaciones_revelacion: { pieza: PieceId; voto: "si" | "no"; motivos: string[]; nota: string | null }[];
  refresh: { numero: number; nota: string | null; opciones_rechazadas: unknown[] };
  /** Las únicas tipografías que la app sabe usar: de títulos por estilo y de texto. */
  tipografias_disponibles?: { titulos_por_estilo: Record<string, readonly string[]>; texto: readonly string[] };
};

type Preset = { nombre: string; porque: string; principal: string; acento: string; fondo: string; texto: string; tonos: string[] };

const PRESETS: Preset[] = [
  { nombre: "Terracota y arena", porque: "Cálida y cercana", principal: "#B5532D", acento: "#D8A23A", fondo: "#FBF4EA", texto: "#2B1D16", tonos: ["cercana", "autentica", "tranquila"] },
  { nombre: "Azul marino", porque: "Serio sin ser frío", principal: "#14365D", acento: "#1FA3C4", fondo: "#F2F6FB", texto: "#16202B", tonos: ["profesional", "directa"] },
  { nombre: "Bugambilia de día", porque: "Luminosa y creativa", principal: "#AE0091", acento: "#F4C542", fondo: "#FFFFFF", texto: "#2B1E2A", tonos: ["inspiradora", "energetica", "atrevida"] },
  { nombre: "Noche y oro", porque: "Elegante y sobria", principal: "#111111", acento: "#C9A24B", fondo: "#F6F1E8", texto: "#2A2A2A", tonos: ["profesional", "tranquila"] },
  { nombre: "Coral y salvia", porque: "Optimista y humana", principal: "#E8604C", acento: "#6F9C7D", fondo: "#FFF6F1", texto: "#2E1A2B", tonos: ["inspiradora", "cercana", "divertida"] },
  { nombre: "Eléctrico", porque: "Mucha energía", principal: "#3B2BEA", acento: "#FF6A2B", fondo: "#FFFFFF", texto: "#14101A", tonos: ["energetica", "atrevida", "divertida"] },
  { nombre: "Bosque", porque: "Natural y tranquila", principal: "#2F5D43", acento: "#E0B34A", fondo: "#F5F7F1", texto: "#18241D", tonos: ["tranquila", "autentica"] },
  { nombre: "Magenta y limón", porque: "Pop y divertida", principal: "#D6247A", acento: "#E8E014", fondo: "#FFFFFF", texto: "#14101A", tonos: ["divertida", "atrevida"] },
];

const palette = (p: Preset, id: string): PaletteOption => ({ id, nombre: p.nombre, porque: p.porque, colores: { principal: p.principal, acento: p.acento, fondo: p.fondo, texto: p.texto } });

/** Ordena los presets por afinidad con el tono elegido y se salta los ya rechazados. */
function ranked(tonos: string[], rejected: unknown[]): Preset[] {
  const used = new Set(rejected.map((r) => (r as { nombre?: string })?.nombre));
  const score = (p: Preset) => p.tonos.filter((t) => tonos.includes(t)).length;
  return [...PRESETS].filter((p) => !used.has(p.nombre)).sort((a, b) => score(b) - score(a));
}

function round1(i: KitInput): PaletteOption[] {
  const list = ranked(i.tono_elegido, i.refresh.opciones_rechazadas);
  const a = list[0] ?? PRESETS[0]!;
  // B: mismo carácter, otra temperatura: el siguiente más afín que no sea de la misma temperatura.
  const b = list.find((p) => p.nombre !== a.nombre) ?? PRESETS[1]!;
  return [palette(a, "A"), palette(b, "B")];
}

function round2(i: KitInput): PaletteOption[] {
  const base = (i.elecciones_previas.find((e) => e.ronda === 1)?.opcion as PaletteOption | undefined)?.colores ?? PRESETS[0]!;
  const swap = i.refresh.numero % 2 === 1;
  const alt = PRESETS.find((p) => p.acento !== base.acento) ?? PRESETS[1]!;
  const mk = (id: string, nombre: string, porque: string, c: { principal: string; acento: string; fondo: string }): PaletteOption => ({
    id,
    nombre,
    porque,
    colores: { ...c, texto: inkOn(c.fondo) === "#FFFFFF" ? "#FFFFFF" : base.texto },
  });
  const dark = mix(base.principal, "#000000", 0.78);
  return [
    mk("A", "Fondo suave", "Tu color principal, con un fondo más suave", { principal: base.principal, acento: base.acento, fondo: mix(base.fondo, base.principal, swap ? 0.1 : 0.06) }),
    mk("B", "Fondo cálido", "Mismo acento sobre un fondo más cálido", { principal: base.principal, acento: base.acento, fondo: mix(base.fondo, "#F4C542", swap ? 0.14 : 0.1) }),
    mk("C", "Otro acento", "Mismo fondo con otro color de acento", { principal: base.principal, acento: alt.acento, fondo: base.fondo }),
    mk("D", "Versión oscura", "El mismo estilo en modo oscuro", { principal: base.principal, acento: base.acento, fondo: dark }),
  ];
}

function round3(i: KitInput): FontOption[] {
  const used = new Set(i.refresh.opciones_rechazadas.map((r) => (r as { titulos?: string })?.titulos));
  const all = [
    ...FONT_PAIRS,
    { id: "E", nombre: "Con carácter", titulos: "Bricolage Grotesque", texto: "Inter" },
    { id: "F", nombre: "Clásica", titulos: "Playfair Display", texto: "Lato" },
    { id: "G", nombre: "Redondeada", titulos: "Righteous", texto: "Nunito" },
    { id: "H", nombre: "Moderna y limpia", titulos: "Space Grotesk", texto: "Manrope" },
  ].filter((p) => !used.has(p.titulos));
  return all.slice(0, 4).map((p, idx) => ({ id: "ABCD"[idx]!, nombre: p.nombre, titulos: p.titulos, texto: p.texto, porque: `${p.titulos} para titular y ${p.texto} para leer` }));
}

const TITLE_STYLES: TitleOption[] = [
    { id: "A", nombre: "Resaltador", mayusculas: false, caja: "ninguna", alineacion: "centro", resaltado: "marcador" },
    { id: "B", nombre: "Firma", mayusculas: false, caja: "ninguna", alineacion: "izquierda", resaltado: "linea" },
    { id: "C", nombre: "Impacto", mayusculas: true, caja: "solida", alineacion: "centro", resaltado: "ninguno" },
    { id: "D", nombre: "Cinta", mayusculas: false, caja: "translucida", alineacion: "centro", resaltado: "palabra_grande" },
    { id: "E", nombre: "Titular grande", mayusculas: true, caja: "ninguna", alineacion: "izquierda", resaltado: "palabra_grande" },
    { id: "F", nombre: "Banda", mayusculas: false, caja: "banda", alineacion: "centro", resaltado: "ninguno" },
];

function round4(i: KitInput): TitleOption[] {
  const all = TITLE_STYLES;
  const used = new Set(i.refresh.opciones_rechazadas.map((r) => (r as { nombre?: string })?.nombre));
  return all.filter((o) => !used.has(o.nombre)).slice(0, 4).map((o, idx) => ({ ...o, id: "ABCD"[idx]! }));
}

export function mockKitRound(i: KitInput): PaletteOption[] | FontOption[] | TitleOption[] {
  switch (i.numero_ronda) {
    case 1:
      return round1(i);
    case 2:
      return round2(i);
    case 3:
      return round3(i);
    default:
      return round4(i);
  }
}

/** Kit final a partir de lo elegido; las piezas con 👎 se ajustan una por una (regla 15 de la skill). */
export function mockKitFinal(i: KitInput, previous: FinalKit | null): FinalKit {
  const pick = (r: number) => i.elecciones_previas.find((e) => e.ronda === r)?.opcion;
  const pal = (pick(2) ?? pick(1)) as PaletteOption | undefined;
  const fonts = pick(3) as FontOption | undefined;
  const titles = i.elecciones_previas.filter((e) => e.ronda === 4).map((e) => e.opcion as TitleOption);
  const els = i.elecciones_previas.filter((e) => e.ronda === 5).map((e) => e.opcion as { id: string });
  const c = pal?.colores ?? { principal: PRESETS[0]!.principal, acento: PRESETS[0]!.acento, fondo: PRESETS[0]!.fondo, texto: PRESETS[0]!.texto };

  const kit: FinalKit =
    previous ??
    ({
      skill_version: "kit-visual-v1",
      colores: c,
      tipografias: { titulos: { familia: fonts?.titulos ?? "Poppins", peso: 700 }, texto: { familia: fonts?.texto ?? "Nunito", peso: 700 } },
      titulos_video: (titles.length ? titles : [round4(i)[0]!]).slice(0, 2).map((t, idx, arr) => ({
        estilo: t.nombre,
        uso: arr.length === 1 ? "todos" : idx === 0 ? "ganchos" : "reflexiones",
        mayusculas: t.mayusculas,
        alineacion: t.alineacion,
        caja: t.caja,
        resaltado: t.resaltado,
        color_texto: "#FFFFFF",
        color_detalle: c.acento,
      })),
      subtitulos: { color_texto: "#FFFFFF", color_resaltado: c.acento, posicion: "inferior", palabras_por_linea: 3 },
      elementos: els.filter((e) => (ELEMENT_IDS as string[]).includes(e.id)).slice(0, 2).map((e) => ({ id: e.id as (typeof ELEMENT_IDS)[number], color: c.acento })),
      carrusel: { estilos_portada: ["foto_con_bloque", "solida"], fondo_portada: c.fondo, color_titulo_portada: c.texto, color_bloque_foto: c.fondo, fondo_interiores: c.fondo },
      preferencias_visuales: [],
      mensaje_al_creador: "Tu kit ya se parece a ti. A partir de hoy todo lo que hagas en la app va a verse así de consistente.",
    } as FinalKit);

  const next: FinalKit = structuredClone(kit);
  for (const v of i.calificaciones_revelacion.filter((x) => x.voto === "no")) {
    const detalle = [v.motivos.join(", "), v.nota].filter(Boolean).join(" · ");
    next.preferencias_visuales = [...next.preferencias_visuales.filter((p) => p.sobre !== v.pieza), { sobre: v.pieza, le_gusta: false, detalle }];
    switch (v.pieza) {
      case "carrusel_foto_con_bloque":
        next.carrusel.color_bloque_foto = next.carrusel.color_bloque_foto === next.colores.fondo ? next.colores.principal : next.colores.fondo;
        break;
      case "carrusel_solida":
        next.carrusel.fondo_portada = next.carrusel.fondo_portada === next.colores.fondo ? next.colores.principal : next.colores.fondo;
        next.carrusel.color_titulo_portada = inkOn(next.carrusel.fondo_portada);
        break;
      case "reel_gancho":
        next.titulos_video[0]!.caja = next.titulos_video[0]!.caja === "ninguna" ? "translucida" : "ninguna";
        break;
      case "reel_reflexion": {
        const t = next.titulos_video[next.titulos_video.length - 1]!;
        t.resaltado = t.resaltado === "linea" ? "marcador" : "linea";
        break;
      }
    }
  }
  return next;
}

/** Opciones para el selector manual (cuando se agotan los refrescos de una ronda). */
export const manualPalettes = (): PaletteOption[] => PRESETS.map((p, i) => palette(p, String(i + 1)));
export const manualTitleStyles = (): TitleOption[] => TITLE_STYLES.map((o) => ({ ...o }));
