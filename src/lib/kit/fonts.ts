// Tipografías permitidas para el kit visual. Son Google Fonts con acentos y ñ, ALOJADAS EN EL SERVIDOR
// (public/fonts/kit, generadas con scripts/fetch-kit-fonts.mjs): no se pide nada a Google desde el navegador
// y el editor Pro (Remotion) podrá usar los mismos archivos. La IA solo puede elegir de esta lista (regla 6 de la skill).

/** Familias con carácter para títulos (también valen las de texto). */
export const TITLE_FONTS = [
  "DM Serif Display", "Playfair Display", "Fraunces", "Abril Fatface", "Bebas Neue", "Anton", "Montserrat", "Poppins",
  "Bricolage Grotesque", "Archivo Black", "Oswald", "Space Grotesk", "Syne", "Lora", "Merriweather", "Rubik", "Unbounded",
  "Righteous", "Pacifico", "Caveat",
] as const;

/** Familias muy legibles para el texto y los subtítulos. */
export const TEXT_FONTS = ["Bricolage Grotesque", "Inter", "DM Sans", "Nunito", "Open Sans", "Lato", "Work Sans", "Source Sans 3", "Karla", "Manrope", "Outfit", "Mulish"] as const;

export const ALL_FONTS: readonly string[] = [...new Set<string>([...TITLE_FONTS, ...TEXT_FONTS])];

const norm = (s: string) => s.trim().toLowerCase();
const byName = (list: readonly string[], name: string) => list.find((f) => norm(f) === norm(name)) ?? null;

/** Devuelve el nombre canónico si la familia está permitida para títulos; si no, null. */
export const titleFont = (name: string) => byName(ALL_FONTS, name);
/** Devuelve el nombre canónico si la familia está permitida para texto; si no, null. */
export const textFont = (name: string) => byName(TEXT_FONTS, name);

/** Cursivas o inclinadas, que algunas creadoras descartan: sirve para avisarlo en pantalla. */
export const SCRIPT_FONTS = new Set(["Pacifico", "Caveat"]);

/** Pila CSS segura (el nombre ya viene validado contra la lista). */
export const fontStack = (name: string) => `"${name}", system-ui, sans-serif`;

export const KIT_FONTS_CSS = "/fonts/kit/kit-fonts.css";

/** Pares sugeridos (título + texto) para los modos de prueba y el selector manual. */
export const FONT_PAIRS = [
  { id: "A", nombre: "Editorial", titulos: "DM Serif Display", texto: "DM Sans" },
  { id: "B", nombre: "Moderna", titulos: "Montserrat", texto: "Open Sans" },
  { id: "C", nombre: "Con fuerza", titulos: "Anton", texto: "Inter" },
  { id: "D", nombre: "Amable", titulos: "Poppins", texto: "Nunito" },
] as const;
