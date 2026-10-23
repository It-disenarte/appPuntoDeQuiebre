// Tipografías permitidas para el kit visual. Son Google Fonts con acentos y ñ, ALOJADAS EN EL SERVIDOR
// (public/fonts/kit, generadas con scripts/fetch-kit-fonts.mjs): no se pide nada a Google desde el navegador
// y el editor Pro (Remotion) podrá usar los mismos archivos. La IA solo puede elegir de esta lista (regla 6 de la skill).

/** Familias con carácter para títulos (también valen las de texto). */
export const TITLE_FONTS = [
  "DM Serif Display", "Playfair Display", "Fraunces", "Abril Fatface", "Bebas Neue", "Anton", "Montserrat", "Poppins",
  "Bricolage Grotesque", "Archivo Black", "Oswald", "Space Grotesk", "Syne", "Lora", "Merriweather", "Rubik", "Unbounded",
  "Righteous", "Pacifico", "Caveat",
  // Con estilo (todas con acentos y ñ): ver FONT_STYLES.
  "UnifrakturMaguntia", "Pirata One", "New Rocker", "MedievalSharp", "Uncial Antiqua",
  "Metal Mania", "Eater", "Creepster", "Jolly Lodger", "Rubik Wet Paint", "Rubik Spray Paint", "Rubik Dirt", "Rubik Burned",
  "Orbitron", "Press Start 2P", "Monoton", "Black Ops One", "Chakra Petch", "Russo One",
  "Staatliches", "Teko", "Bungee", "Bangers", "Luckiest Guy", "Bowlby One", "Alfa Slab One", "Big Shoulders Display",
  "Cinzel", "Cinzel Decorative", "Yeseva One", "Cormorant Garamond",
  "Permanent Marker", "Rock Salt", "Special Elite", "Lobster", "Dancing Script", "Shrikhand", "Kaushan Script", "Great Vibes",
] as const;

/** Las de título agrupadas por estilo: se le pasan a la IA para que, si pides “góticas” o “metal”, elija de aquí. */
export const FONT_STYLES: Record<string, readonly string[]> = {
  gotica: ["UnifrakturMaguntia", "Pirata One", "New Rocker", "MedievalSharp", "Uncial Antiqua"],
  metal_oscuro: ["Metal Mania", "Eater", "Creepster", "Jolly Lodger", "Rubik Wet Paint", "Rubik Spray Paint", "Rubik Dirt", "Rubik Burned"],
  tech_retro: ["Orbitron", "Press Start 2P", "Monoton", "Black Ops One", "Chakra Petch", "Russo One"],
  impacto: ["Anton", "Bebas Neue", "Archivo Black", "Staatliches", "Teko", "Bungee", "Bangers", "Luckiest Guy", "Bowlby One", "Alfa Slab One", "Big Shoulders Display", "Oswald"],
  elegante: ["DM Serif Display", "Playfair Display", "Fraunces", "Cinzel", "Cinzel Decorative", "Yeseva One", "Cormorant Garamond", "Abril Fatface"],
  manuscrita: ["Pacifico", "Caveat", "Permanent Marker", "Rock Salt", "Special Elite", "Lobster", "Dancing Script", "Shrikhand", "Kaushan Script", "Great Vibes"],
  moderna: ["Montserrat", "Poppins", "Bricolage Grotesque", "Space Grotesk", "Syne", "Rubik", "Unbounded", "Righteous", "Lora", "Merriweather"],
};

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
export const SCRIPT_FONTS = new Set(["Pacifico", "Caveat", "Permanent Marker", "Rock Salt", "Lobster", "Dancing Script", "Shrikhand", "Kaushan Script", "Great Vibes"]);

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
