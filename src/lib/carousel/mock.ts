// Respuestas de PRUEBA de la skill de carruseles (sin IA): sirven para ver todo el flujo antes de tener ANTHROPIC_API_KEY.
import type { Brief, CarruselOut, IdeasOut, InterviewOut, Slide, SlideOut } from "./schemas";

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const words = (s: string, n: number) => s.split(/\s+/).slice(0, n).join(" ");

export function mockIdeas(brief: Brief): IdeasOut {
  const t = clip(brief.tema, 60);
  return {
    skill_version: "carruseles-v3",
    tipo_recomendado: brief.tipo === "recomiendame" ? "lista" : null,
    porque_tipo: brief.tipo === "recomiendame" ? "Las listas se guardan y se comparten más." : null,
    ideas: [
      { id: "A", angulo: "segura", titulo: clip(`${t}: lo esencial, paso a paso`, 70), promesa: "Entiendes lo básico y puedes aplicarlo hoy." },
      { id: "B", angulo: "punzante", titulo: clip(`Lo que te dijeron de ${t} no es cierto`, 70), promesa: "Dejas un error común que te frena." },
      { id: "C", angulo: "lateral", titulo: clip(`Lo que ${t} me enseñó sin querer`, 70), promesa: "Ves el tema desde una historia real." },
    ],
  };
}

export function mockInterview(): InterviewOut {
  return {
    skill_version: "carruseles-v3",
    preguntas: [
      { id: "estilo", texto: "¿Con qué estilo te imaginas las imágenes?", opciones: ["Foto realista", "Ilustración plana", "Anime de los 90", "Acuarela", "3D tipo animación", "Collage", "Retro", "Minimalista con objetos"], recomendada: "Foto realista", porque: "Se ve profesional y cercana.", permite_inspo: true, elige_por_mi: true },
      { id: "ambiente", texto: "¿Qué sensación quieres que den?", opciones: ["Cálida", "Enérgica", "Tranquila", "Misteriosa", "Divertida"], multiple: true },
      { id: "aparece_creador", texto: "¿Quieres salir tú en las imágenes?", opciones: ["No, solo objetos o escenas", "Sí, subo una foto mía como referencia"] },
      { id: "colores", texto: "¿Usamos los colores de tu marca?", opciones: ["Sí, los de mi kit", "Otros: te los cuento"] },
      { id: "narracion", texto: "Cuéntame cómo te imaginas la portada: qué se ve, dónde pasa y qué sientes al verla.", opciones: [], tipo: "voz_o_texto", ejemplo: "Una mesa de madera con luz de ventana, una taza humeante y un cuaderno abierto." },
      { id: "herramienta", texto: "¿Dónde vas a crear las imágenes?", opciones: ["Gemini", "ChatGPT", "No sé, recomiéndame"] },
    ],
  };
}

type MockCtx = { brief: Brief; titulo: string; kit: { fondo: string; acento: string } | null; style: string | null };

export function mockCarrusel(c: MockCtx): CarruselOut {
  const { brief } = c;
  const withIa = brief.estilo_imagenes === "ia" || brief.estilo_imagenes === "mixto";
  const withPhotos = brief.estilo_imagenes === "mis_fotos" || brief.estilo_imagenes === "mixto";
  const tema = clip(brief.tema, 50);
  const puntos = ["Empieza por lo más simple", "Evita el error que casi todos cometen", "Hazlo en pasos pequeños", "Mide lo que sí funciona", "Repite lo que te salió bien"];
  const mk = (n: number, rol: string, plantilla: Slide["plantilla"], titulo: string, extra: Partial<Slide> = {}): Slide => ({
    n,
    rol,
    plantilla,
    titulo,
    cuerpo: null,
    resaltar: null,
    icono: null,
    dato: null,
    etiqueta: null,
    movimiento: ["fondo_respira"],
    imagen: { fuente: "ninguna", foto_guia: null, prompt_ia: null, zona_texto: "ninguna" },
    ...extra,
  });
  const ia = (zona: Slide["imagen"]["zona_texto"], escena: string) => ({
    fuente: "ia" as const,
    foto_guia: null,
    prompt_ia: `${escena}. Formato vertical 4:5. ${zona === "arriba" ? "El objeto ocupa solo la mitad de abajo; la mitad de arriba es fondo liso o desenfocado." : "El objeto va a un lado; el resto queda libre y simple."} Sin texto, sin letras, sin logotipos.${c.style ? ` ESTILO: ${c.style}.` : ""}`,
    zona_texto: zona,
  });
  const photo = (que: string) => ({ fuente: "foto_creador" as const, foto_guia: { que_foto: que, como_tomarla: "Vertical, luz de ventana de frente y espacio libre arriba para el título.", alternativa: "Una foto de tus manos trabajando." }, prompt_ia: null, zona_texto: "arriba" as const });

  const slides: Slide[] = [
    mk(1, "portada", withIa || withPhotos ? "portada_impacto" : "portada_texto", c.titulo, { resaltar: words(c.titulo, 8).split(" ").slice(-1)[0] ?? null, etiqueta: "Guárdalo", movimiento: ["ken_burns", "particulas_orbita"], imagen: withPhotos ? photo("Tú de medio cuerpo, mirando a cámara") : withIa ? ia("arriba", `Escena que representa ${tema}`) : { fuente: "ninguna", foto_guia: null, prompt_ia: null, zona_texto: "ninguna" } }),
    mk(2, "contexto", "texto", "Por qué importa", { cuerpo: `Si trabajas en ${tema}, esto te ahorra tiempo y errores.`, icono: "bulb", dato: null }),
    ...puntos.slice(0, 4).map((p, i) => mk(3 + i, "punto", i % 2 ? "texto" : withIa ? "foto_texto_libre" : "texto", p, { cuerpo: "Un ejemplo concreto y corto, con tus palabras.", icono: ["target", "alert-triangle", "stairs", "chart-bar"][i] ?? "star", dato: String(i + 1), imagen: i % 2 || !withIa ? { fuente: "ninguna", foto_guia: null, prompt_ia: null, zona_texto: "ninguna" } : ia("abajo", `Objeto relacionado con ${tema}`) })),
    mk(7, "giro", "frase", "Pequeños pasos, gran cambio", { resaltar: "gran cambio", cuerpo: null }),
    mk(8, "cta", "cta", brief.objetivo === "seguidores" ? "Sígueme para más" : brief.objetivo === "leads" && brief.palabra_clave ? `Comenta ${brief.palabra_clave}` : brief.objetivo === "compartidos" ? "Compártelo con alguien" : "Guárdalo para después", { icono: brief.objetivo === "seguidores" ? "user-plus" : "bookmark", cuerpo: "Y cuéntame cuál vas a probar primero." }),
  ];
  return {
    skill_version: "carruseles-v3",
    titulo: c.titulo,
    tipo: brief.tipo,
    estructura_porque: "Abre con una promesa, da un punto por slide y cierra con la acción que pediste.",
    estilo_detectado: c.style,
    slides,
    animacion: { duracion_s: 6, hilo_comun: "Destellos en órbita en todos los slides", porque: "Así se ve como una sola pieza." },
    fondo_slides_texto: {
      recomendado: "blanco",
      elegido: null,
      porque: "Se lee mejor y deja respirar las imágenes.",
      opciones: [
        { id: "rosa", tipo: "solido", nombre: "Fondo de color", colores: [c.kit?.acento ?? "#FE6807"], prompt_ia: null },
        { id: "blanco", tipo: "solido", nombre: "Fondo blanco", colores: ["#FFFFFF"], prompt_ia: null },
        { id: "amarillo", tipo: "solido", nombre: "Fondo del kit", colores: [c.kit?.fondo ?? "#FFF4D6"], prompt_ia: null },
      ],
    },
    bloque_estilo_ia: withIa ? (c.style ?? "Foto realista, luz suave de ventana, colores naturales, encuadre vertical limpio") : null,
    instrucciones_ia: withIa ? ["Abre Gemini o ChatGPT", "Pega el primer prompt y genera la imagen", "Genera todas las imágenes en la misma conversación para que salgan parecidas", "Descarga cada una y súbela en su slide"] : [],
    datos_para_caption: { tema: brief.tema, promesa: "Una guía corta para aplicar hoy", palabra_clave: brief.palabra_clave },
    mensaje_al_creador: "Esta es una versión de prueba: con la IA activa los textos usan tu voz y tu marca.",
  };
}

export function mockSlide(current: Slide, nota: string): SlideOut {
  return { skill_version: "carruseles-v3", slide: { ...current, titulo: clip(`${current.titulo} (otra versión)`, 80) }, que_cambie: `Probé otra redacción según tu nota: “${clip(nota, 60)}”.` };
}
