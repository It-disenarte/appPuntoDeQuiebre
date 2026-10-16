import type { KitStage } from "./service";

/** Dirección de cada etapa del kit. */
export const stageUrl = (s: KitStage): string =>
  typeof s === "number" ? `/mi-marca/kit/ronda/${s}` : s === "fotos" ? "/mi-marca/kit/fotos" : s === "revelacion" ? "/mi-marca/kit/revelacion" : "/mi-marca/kit";
