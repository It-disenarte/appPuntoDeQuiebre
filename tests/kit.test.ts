import { describe, expect, it } from "vitest";
import { contrastRatio, inkOn, mix, readable } from "@/lib/kit/contrast";
import { ALL_FONTS, textFont, TEXT_FONTS, titleFont, TITLE_FONTS } from "@/lib/kit/fonts";
import { manualPalettes, manualTitleStyles, mockKitFinal, mockKitRound, type KitInput } from "@/lib/kit/mock";
import {
  checkFinalKit,
  ELEMENT_IDS,
  finalKitSchema,
  fontRoundSchema,
  keepAllowedFonts,
  keepReadablePalettes,
  paletteRoundSchema,
  titleRoundSchema,
  type FinalKit,
  type FontOption,
  type PaletteOption,
  type TitleOption,
} from "@/lib/kit/schemas";
import { lookFromChoices, lookFromFinal } from "@/lib/kit/look";
import fs from "node:fs";

const input = (over: Partial<KitInput> = {}): KitInput => ({
  modo: "ronda",
  numero_ronda: 1,
  creador_id: "u1",
  auditoria: null,
  respuestas_tarjetas: [],
  tono_elegido: ["inspiradora", "energetica"],
  gancho_muestra: "Lo que sea que hagas, hazlo bonito",
  elecciones_previas: [],
  calificaciones_revelacion: [],
  refresh: { numero: 0, nota: null, opciones_rechazadas: [] },
  ...over,
});

describe("contraste (WCAG)", () => {
  it("calcula razones conocidas", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(readable("#2B1E2A", "#FFFFFF")).toBe(true);
    expect(readable("#F4C542", "#FFFFFF")).toBe(false); // amarillo sobre blanco no se lee
    expect(readable("no-es-color", "#FFFFFF")).toBe(false);
  });
  it("elige tinta clara u oscura según el fondo", () => {
    expect(inkOn("#111111")).toBe("#FFFFFF");
    expect(inkOn("#FFFFFF")).toBe("#09080D");
    expect(inkOn("#F4C542")).toBe("#09080D");
  });
  it("mezcla colores", () => {
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mix("#FF0000", "#FF0000", 0.3)).toBe("#FF0000");
  });
});

describe("tipografías permitidas", () => {
  it("solo Google Fonts de la lista, sin importar mayúsculas", () => {
    expect(titleFont("dm serif display")).toBe("DM Serif Display");
    expect(titleFont("Comic Sans MS")).toBeNull();
    expect(titleFont('x"; background:url(//evil)')).toBeNull(); // no se puede inyectar CSS por el nombre
    expect(textFont("Bricolage Grotesque")).toBe("Bricolage Grotesque"); // el ejemplo de Blombito
    expect(textFont("Anton")).toBeNull(); // una de títulos no sirve para el texto
  });
  it("todas las familias tienen su archivo en el servidor", () => {
    const css = fs.readFileSync("public/fonts/kit/kit-fonts.css", "utf8");
    for (const f of ALL_FONTS) expect(css).toContain(`font-family: "${f}"`);
    expect(new Set(ALL_FONTS).size).toBe(ALL_FONTS.length);
    expect(TITLE_FONTS.length + TEXT_FONTS.length).toBeGreaterThan(25);
  });
});

describe("validación de lo que devuelve la IA", () => {
  const pal = (id: string, texto: string, fondo: string): PaletteOption => ({ id, nombre: id, porque: "", colores: { principal: "#AE0091", acento: "#F4C542", fondo, texto } });
  it("descarta las paletas donde el texto no se lee", () => {
    const kept = keepReadablePalettes([pal("A", "#2B1E2A", "#FFFFFF"), pal("B", "#F4C542", "#FFFFFF")]);
    expect(kept.map((o) => o.id)).toEqual(["A"]);
  });
  it("normaliza los colores a mayúsculas y rechaza los inválidos", () => {
    const ok = paletteRoundSchema.parse({ opciones: [{ id: "A", nombre: "x", colores: { principal: "#ae0091", acento: "#f4c542", fondo: "#ffffff", texto: "#2b1e2a" } }] });
    expect(ok.opciones[0]!.colores.principal).toBe("#AE0091");
    expect(paletteRoundSchema.safeParse({ opciones: [{ id: "A", nombre: "x", colores: { principal: "rojo", acento: "#f4c542", fondo: "#ffffff", texto: "#2b1e2a" } }] }).success).toBe(false);
  });
  it("deja solo pares de tipografías permitidos y distintos", () => {
    const opts: FontOption[] = [
      { id: "A", nombre: "", titulos: "DM Serif Display", texto: "Bricolage Grotesque", porque: "" },
      { id: "B", nombre: "", titulos: "Comic Sans MS", texto: "Inter", porque: "" },
      { id: "C", nombre: "", titulos: "Inter", texto: "Inter", porque: "" },
      { id: "D", nombre: "", titulos: "anton", texto: "lato", porque: "" },
    ];
    const kept = keepAllowedFonts(opts);
    expect(kept.map((o) => o.id)).toEqual(["A", "D"]);
    expect(kept[1]).toMatchObject({ titulos: "Anton", texto: "Lato" }); // nombre canónico
  });
  it("los estilos de título toman valores por defecto", () => {
    const r = titleRoundSchema.parse({ opciones: [{ id: "A", mayusculas: true, caja: "solida" }] });
    expect(r.opciones[0]).toMatchObject({ alineacion: "centro", resaltado: "ninguno" });
    expect(titleRoundSchema.safeParse({ opciones: [{ id: "A", caja: "neon" }] }).success).toBe(false);
  });
});

describe("generador de prueba de la skill", () => {
  it("ronda 1: dos paletas legibles según el tono", () => {
    const out = mockKitRound(input()) as PaletteOption[];
    expect(paletteRoundSchema.safeParse({ opciones: out }).success).toBe(true);
    expect(out).toHaveLength(2);
    for (const o of out) expect(readable(o.colores.texto, o.colores.fondo)).toBe(true);
    expect(out[0]!.nombre).toBe("Bugambilia de día"); // tono inspiradora + enérgica
  });
  it("el refresh no repite lo rechazado", () => {
    const first = mockKitRound(input()) as PaletteOption[];
    const again = mockKitRound(input({ refresh: { numero: 1, nota: "más sobrio", opciones_rechazadas: first } })) as PaletteOption[];
    for (const o of again) expect(first.map((x) => x.nombre)).not.toContain(o.nombre);
  });
  it("ronda 2: cuatro variantes, todas legibles, solo cambian fondo o acento", () => {
    const base = (mockKitRound(input()) as PaletteOption[])[0]!;
    const out = mockKitRound(input({ numero_ronda: 2, elecciones_previas: [{ ronda: 1, eligio: "A", opcion: base }] })) as PaletteOption[];
    expect(out).toHaveLength(4);
    for (const o of out) {
      expect(readable(o.colores.texto, o.colores.fondo)).toBe(true);
      expect(o.colores.principal).toBe(base.colores.principal);
    }
    expect(out.some((o) => o.colores.acento === base.colores.acento && o.colores.fondo !== base.colores.fondo)).toBe(true);
    expect(out.some((o) => o.colores.fondo === base.colores.fondo && o.colores.acento !== base.colores.acento)).toBe(true);
  });
  it("ronda 3: cuatro pares de tipografías permitidas", () => {
    const out = mockKitRound(input({ numero_ronda: 3 })) as FontOption[];
    expect(fontRoundSchema.safeParse({ opciones: out }).success).toBe(true);
    expect(keepAllowedFonts(out)).toHaveLength(4);
  });
  it("ronda 4: cuatro estilos distintos", () => {
    const out = mockKitRound(input({ numero_ronda: 4 })) as TitleOption[];
    expect(out).toHaveLength(4);
    expect(new Set(out.map((o) => o.nombre)).size).toBe(4);
    expect(manualTitleStyles()).toHaveLength(6);
    expect(manualPalettes().length).toBeGreaterThanOrEqual(6);
  });
});

describe("kit final", () => {
  const base = mockKitRound(input()) as PaletteOption[];
  const fonts = (mockKitRound(input({ numero_ronda: 3 })) as FontOption[])[0]!;
  const titles = mockKitRound(input({ numero_ronda: 4 })) as TitleOption[];
  const previas: KitInput["elecciones_previas"] = [
    { ronda: 1, eligio: "A", opcion: base[0] },
    { ronda: 3, eligio: "A", opcion: fonts },
    { ronda: 4, eligio: "A", opcion: titles[0] },
    { ronda: 4, eligio: "B", opcion: titles[1] },
    { ronda: 5, eligio: "destello", opcion: { id: "destello" } },
    { ronda: 5, eligio: "onda", opcion: { id: "onda" } },
  ];
  const kit = () => mockKitFinal(input({ modo: "final", numero_ronda: 5, elecciones_previas: previas }), null);

  it("cumple el esquema y las validaciones por código", () => {
    const k = kit();
    expect(finalKitSchema.safeParse(k).success).toBe(true);
    expect(checkFinalKit(k).ok).toBe(true);
    expect(k.titulos_video).toHaveLength(2);
    expect(k.titulos_video.map((t) => t.uso)).toEqual(["ganchos", "reflexiones"]); // elección doble: un uso distinto cada uno
    expect(k.elementos.map((e) => e.id)).toEqual(["destello", "onda"]);
    for (const e of k.elementos) expect(ELEMENT_IDS).toContain(e.id);
  });
  it("rechaza tipografías fuera de la lista o texto ilegible", () => {
    const k = kit();
    expect(checkFinalKit({ ...k, tipografias: { ...k.tipografias, titulos: { familia: "Comic Sans MS", peso: 400 } } }).ok).toBe(false);
    expect(checkFinalKit({ ...k, colores: { ...k.colores, texto: k.colores.fondo } }).ok).toBe(false);
  });
  it("con 👎 ajusta solo esa pieza y registra la preferencia", () => {
    const before = kit();
    const after = mockKitFinal(input({ modo: "final", numero_ronda: 5, elecciones_previas: previas, calificaciones_revelacion: [{ pieza: "carrusel_foto_con_bloque", voto: "no", motivos: ["colores"], nota: "muy invasivo" }] }), before);
    expect(after.carrusel.color_bloque_foto).not.toBe(before.carrusel.color_bloque_foto);
    expect(after.carrusel.fondo_portada).toBe(before.carrusel.fondo_portada);
    expect(after.titulos_video).toEqual(before.titulos_video);
    expect(after.colores).toEqual(before.colores);
    expect(after.preferencias_visuales.find((p) => p.sobre === "carrusel_foto_con_bloque")).toMatchObject({ le_gusta: false });
    expect(checkFinalKit(after).ok).toBe(true);
  });
  it("tolera lo que la IA real suele devolver (campos opcionales omitidos)", () => {
    const k = kit() as Partial<FinalKit>;
    delete k.preferencias_visuales;
    delete k.mensaje_al_creador;
    delete k.skill_version;
    const r = finalKitSchema.safeParse(k);
    expect(r.success).toBe(true);
  });
  it("arma el aspecto para las vistas previas", () => {
    const look = lookFromFinal(kit(), "reflexiones");
    expect(look.titulos).toBe(fonts.titulos);
    expect(look.elementos).toHaveLength(2);
    expect(lookFromChoices({}).colores.principal).toBe("#191BDF");
  });
});
