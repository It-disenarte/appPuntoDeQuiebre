// Respuestas de PRUEBA (sin IA) de las skills 4 y 5.
import type { Current, PhotoOut, ProfileOut } from "./schemas";

export type ProfileCtx = {
  current: Current;
  nicho: string;
  propuesta: string;
  frase: string;
  pilares: string[];
  colores: { principal: string; fondo: string; acento: string } | null;
};

const clip = (s: string, n: number) => ([...s].length <= n ? s : `${[...s].slice(0, n - 1).join("").trimEnd()}…`);
const ICONS = ["user", "star", "bulb", "heart", "camera", "rocket"];

export function mockProfile(c: ProfileCtx, refresh?: { parte: string; nota: string }): ProfileOut {
  const base = (c.current.nombre.split("|")[0] || c.current.usuario || "Tu nombre").trim().slice(0, 24);
  const kw = c.nicho.split(/[,.]/)[0]!.trim().slice(0, 28) || "contenido";
  const tag = refresh ? ` (${clip(refresh.nota, 12)})` : "";
  const nombres = [`${base} | ${kw}`, `${base} · ${clip(c.frase, 26)}`, `${base} | ${clip(c.pilares[0] ?? kw, 24)}`, `${kw} con ${base}`, `${base} ✨ ${kw}`].map((n) => clip(n, 60) + tag);
  const p = clip(c.propuesta || "Te ayudo a empezar sin complicarte", 70);
  const bios = [
    `✨ ${p}\n💜 ${clip(c.frase, 60)}\n📍 Escríbeme`,
    `${clip(c.frase, 70)}\n${p}`,
    `📌 ${clip(c.pilares.slice(0, 3).join(" · ") || kw, 70)}\n${p}`,
    `${p}\n👇 Empieza por aquí`,
    c.current.biografia ? clip(c.current.biografia, 150) : `${kw}: ${p}`,
  ].map((t) => ({ texto: t + (refresh ? "" : ""), caracteres: [...t].length }));
  const keep = c.current.destacadas.slice(0, 5);
  const names = [...keep, ...(keep.some((k) => /conóceme|sobre mí|mi historia/i.test(k)) ? [] : ["Conóceme"]), ...c.pilares.slice(0, 3).map((x) => clip(x, 15))].slice(0, 6);
  const col = c.colores ?? { principal: "#191BDF", fondo: "#FFFFFF", acento: "#FE6807" };
  return {
    skill_version: "optimizacion-perfil-v1",
    diagnostico: [
      { parte: "nombre", estado: c.current.nombre ? "mejorar" : "falta", por_que: "El nombre se busca en Instagram: conviene sumar la palabra que la gente teclea para encontrarte." },
      { parte: "biografia", estado: c.current.biografia ? "mejorar" : "falta", por_que: "En 3 segundos debe decir qué haces, para quién y cómo seguirte." },
      { parte: "enlace", estado: c.current.enlace ? "bien" : "falta", por_que: c.current.enlace ? "Ya tienes un enlace." : "Sin enlace pierdes a quien quiere saber más." },
      { parte: "categoria", estado: c.current.categoria ? "bien" : "falta", por_que: "La categoría aparece debajo de tu nombre." },
      { parte: "destacadas", estado: keep.length ? "bien" : "falta", por_que: keep.length ? "Mantén las que ya tienes y agrega lo que falte." : "Una destacada de “quién soy” ayuda a quien llega por primera vez." },
    ],
    nombre: { opciones: nombres, palabra_clave: kw },
    biografia: { opciones: bios, nota: "5 opciones" },
    enlace: { recomendacion: c.current.enlace ? "Conserva tu enlace actual." : "Pon el enlace a la red donde más te ven o a una página de enlaces.", por_que: "Es lo único clicable de tu perfil." },
    categoria: c.current.categoria || "Creador de contenido digital",
    destacadas: names.map((n, i) => ({
      nombre: clip(n, 15),
      accion: keep.includes(n) ? ("mantener" as const) : ("agregar" as const),
      que_lleva: i === 0 ? "Quién eres y qué haces" : `Historias de ${n.toLowerCase()}`,
      portada: { estilo: "solida" as const, fondo: i % 2 ? col.fondo : col.principal, icono: ICONS[i % ICONS.length]!, color_icono: i % 2 ? col.principal : col.fondo, elemento: i === 0 ? "destello" : null },
    })),
    orden_de_cambios: ["1. Biografía", "2. Nombre", "3. Enlace", "4. Destacadas"],
  };
}

export function mockPhoto(): PhotoOut {
  return {
    skill_version: "calificador-foto-v1",
    fotos: [
      {
        foto: "",
        calificacion: 7,
        rubrica: { rostro_visible: 2, encuadre: 1, luz: 1, fondo_y_marca: 1, expresion: 1, nitidez: 1 },
        lo_que_funciona: "Se ve tu rostro de frente y la foto está enfocada. (Calificación de ejemplo: aún no hay lectura con IA.)",
        consejos: ["Acércate un poco más para que tu cara ocupe más del círculo.", "Busca luz de ventana de frente.", "Usa la misma foto en todas tus redes."],
        recorte_sugerido: { centro_x: 0.5, centro_y: 0.4, zoom: 1.3 },
      },
    ],
  };
}
