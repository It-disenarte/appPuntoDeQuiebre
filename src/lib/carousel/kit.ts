import { DEFAULT_KIT, type CanvasBg, type CanvasKit } from "@/components/carousel/SlideCanvas";
import { HEX } from "@/lib/kit/contrast";
import type { FinalKit } from "@/lib/kit/schemas";
import type { CarruselOut } from "./schemas";

/** Convierte el kit visual del creador en lo que necesita el lienzo (con valores de respaldo si aún no tiene kit). */
export function canvasKitOf(kit: FinalKit | null): CanvasKit {
  if (!kit) return DEFAULT_KIT;
  const c = kit.carrusel;
  return {
    principal: kit.colores.principal,
    acento: kit.colores.acento,
    fondo: kit.colores.fondo,
    texto: kit.colores.texto,
    titulos: kit.tipografias.titulos.familia,
    fuenteTexto: kit.tipografias.texto.familia,
    fondoPortada: c.fondo_portada,
    tituloPortada: c.color_titulo_portada,
    bloqueFoto: c.color_bloque_foto,
    elementos: kit.elementos.map((e) => ({ id: e.id, color: e.color })),
  };
}

/** Fondo de los slides de texto según la opción elegida (la textura de IA se sustituye por el color del kit). */
export function canvasBgOf(content: CarruselOut, chosen: string | null, kit: CanvasKit): CanvasBg {
  const opts = content.fondo_slides_texto?.opciones ?? [];
  const id = chosen ?? content.fondo_slides_texto?.elegido ?? content.fondo_slides_texto?.recomendado ?? "blanco";
  const o = opts.find((x) => x.id === id);
  const colores = (o?.colores ?? []).filter((c) => HEX.test(c));
  if (o?.tipo === "gradiente" && colores.length >= 2) return { tipo: "gradiente", colores };
  if (o?.tipo === "solido" && colores[0]) return { tipo: "solido", colores };
  return { tipo: "solido", colores: [id === "blanco" ? "#FFFFFF" : kit.fondo] };
}
