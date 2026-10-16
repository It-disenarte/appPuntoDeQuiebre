// Arma el "aspecto" (colores, letras, estilo de título y elementos) que usan las vistas previas.
import type { Look, TitleLook } from "@/components/kit/KitPreview";
import { DEFAULT_TITLE } from "@/components/kit/KitPreview";
import type { FinalKit, FontOption, PaletteOption, TitleOption } from "./schemas";

export const BASE_LOOK: Look = {
  colores: { principal: "#191BDF", acento: "#FE6807", fondo: "#FFFFFF", texto: "#09080D" },
  titulos: "Poppins",
  texto: "Nunito",
  title: DEFAULT_TITLE,
  elementos: [],
};

export const titleLookOf = (o: Pick<TitleOption, "mayusculas" | "caja" | "alineacion" | "resaltado">): TitleLook => ({ mayusculas: o.mayusculas, caja: o.caja, alineacion: o.alineacion, resaltado: o.resaltado });

/** Aspecto con lo elegido hasta ahora (para mostrar las rondas con lo que ya decidió el creador). */
export function lookFromChoices(c: { palette?: PaletteOption; fonts?: FontOption; title?: TitleOption; elementos?: string[] }): Look {
  const colores = c.palette?.colores ?? BASE_LOOK.colores;
  return {
    colores,
    titulos: c.fonts?.titulos ?? BASE_LOOK.titulos,
    texto: c.fonts?.texto ?? BASE_LOOK.texto,
    title: c.title ? titleLookOf(c.title) : DEFAULT_TITLE,
    elementos: (c.elementos ?? []).map((id) => ({ id: id as Look["elementos"][number]["id"], color: colores.acento })),
  };
}

/** Aspecto del kit final; `uso` elige entre los dos estilos de título (ganchos o reflexiones). */
export function lookFromFinal(kit: FinalKit, uso: "ganchos" | "reflexiones" = "ganchos"): Look {
  const t = kit.titulos_video.find((x) => x.uso === uso) ?? kit.titulos_video[0]!;
  return {
    colores: kit.colores,
    titulos: kit.tipografias.titulos.familia,
    texto: kit.tipografias.texto.familia,
    title: titleLookOf(t),
    elementos: kit.elementos.map((e) => ({ id: e.id, color: e.color })),
  };
}
