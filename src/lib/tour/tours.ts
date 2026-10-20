// Guías del asistente de inicio. Cada paso señala un elemento marcado con data-tour="…" (si no está en pantalla, se salta).
// Sin `target`, el paso sale centrado. Textos cortos: qué es y qué hacer.

export type TourStep = { target?: string; title: string; text: string };
export type Tour = { id: string; label: string; steps: TourStep[] };

export const TOURS: Tour[] = [
  {
    id: "inicio",
    label: "Cómo moverte por la app",
    steps: [
      { title: "Te enseño la app", text: "Son 5 pasos rápidos. Puedes saltarlos y volver a verlos cuando quieras con el botón ?." },
      { target: "nav-hoy", title: "Hoy", text: "Lo que toca hacer hoy: tu tarea, tu historia y tu próxima grabación." },
      { target: "nav-semana", title: "Semana", text: "Tu parrilla: los videos y carruseles de la semana, cada uno con su guion." },
      { target: "nav-grabar", title: "Grabar", text: "Tu estudio. Lees el guion en el teleprompter y grabas desde el celular." },
      { target: "nav-progreso", title: "Progreso", text: "Tus métricas explicadas fácil, y el analizador de competencia." },
      { target: "nav-mi-marca", title: "Mi marca", text: "Tu perfil, tu voz, tu horario, tus avisos y tu plan." },
    ],
  },
  {
    id: "hoy",
    label: "Hoy",
    steps: [
      { target: "pagina", title: "Tu día", text: "Aquí ves qué toca hoy. El número naranja es tu racha de días seguidos." },
      { target: "siguiente-paso", title: "Lo primero", text: "Completa estos pasos de tu marca. Con ellos tus guiones suenan a ti." },
      { target: "metricas-pendientes", title: "Tus métricas", text: "Sube capturas de tu Instagram y te explico cómo te fue este mes." },
      { target: "racha", title: "Tu semana", text: "Un círculo por día. Naranja es cumplido; el azul es hoy." },
      { target: "tarea", title: "Tarea de hoy", text: "Lo que publicas hoy. Toca “Ver guion y textos” para ver qué decir." },
      { target: "historia", title: "Historia del día", text: "Una idea rápida para tus historias. Márcala cuando la publiques." },
      { target: "sesion", title: "Próxima grabación", text: "Cuándo grabas y cuántos guiones tienes listos. “Ir al estudio” abre la cámara." },
    ],
  },
  {
    id: "semana",
    label: "Semana",
    steps: [
      { target: "pagina", title: "Tu parrilla", text: "Los videos y carruseles que publicas esta semana, uno por día." },
      { target: "generar", title: "Genera tu semana", text: "Toca el botón y la IA escribe tus guiones con tu voz. Tarda un par de minutos." },
      { target: "mezcla", title: "La mezcla", text: "Cuánto es viral, de nicho y de conversión. Se ajusta sola según tu etapa." },
      { target: "piezas", title: "Tus publicaciones", text: "Toca una para ver su guion, sus textos y marcarla como publicada." },
      { target: "historias", title: "Historias", text: "Una idea por día. Úsala tal cual o cámbiala por una propia." },
    ],
  },
  {
    id: "grabar",
    label: "Grabar",
    steps: [
      { target: "pagina", title: "Tu estudio", text: "Aquí eliges qué video grabar." },
      { target: "videos", title: "Videos por grabar", text: "Toca uno para abrir su guion y la cámara. “Grabado” ya está listo." },
    ],
  },
  {
    id: "grabar-estudio",
    label: "Grabar un video",
    steps: [
      { target: "estudio", title: "La cámara", text: "Aquí está tu guion en 3 partes: gancho, cuerpo y cierre. Elige teleprompter o cámara nativa, graba y sube cada parte." },
      { target: "partes", title: "Partes subidas", text: "Aquí ves lo que ya subiste. Puedes volver a grabar una parte sin repetir todo." },
    ],
  },
  {
    id: "progreso",
    label: "Progreso",
    steps: [
      { target: "pagina", title: "Tu progreso", text: "Tus números comparados contigo, sin tecnicismos." },
      { target: "informe", title: "Tu informe", text: "Sube capturas de tus estadísticas de Instagram y te explico cada número." },
      { target: "analizador", title: "Analizador", text: "Descubre por qué funcionan los reels de las cuentas que admiras." },
    ],
  },
  {
    id: "mi-marca",
    label: "Mi marca",
    steps: [
      { target: "pagina", title: "Mi marca", text: "Todo lo que te hace único: tu marca, tu voz, tu horario y tu cuenta." },
      { target: "plan", title: "Tu plan", text: "Tu suscripción y tus facturas." },
      { target: "brujula", title: "Brújula de marca", text: "Tu nicho, tus pilares y tu frase. Todo lo demás parte de aquí." },
      { target: "atajos", title: "Más herramientas", text: "Tendencias, directos, Instagram y tu perfil. Cada una explica lo que hace." },
      { target: "avisos", title: "Avisos", text: "Te recordamos cuándo grabar y publicar. Enciéndelos para no olvidarte." },
      { target: "lista", title: "Tus pasos", text: "Los pasos de tu marca. Los marcados “Listo” ya los terminaste." },
    ],
  },
  {
    id: "carruseles",
    label: "Carruseles",
    steps: [
      { target: "pagina", title: "Carruseles", text: "Crea carruseles listos para publicar." },
      { target: "nuevo", title: "Crea uno", text: "Cuéntame el tema y armo las diapositivas con tu estilo." },
      { target: "mis-carruseles", title: "Tus carruseles", text: "Ábrelos para editar los textos y descargarlos." },
    ],
  },
  {
    id: "directos",
    label: "Directos",
    steps: [
      { target: "pagina", title: "Tus directos", text: "Una guía para tus transmisiones en vivo." },
      { target: "respuestas", title: "Cuéntame", text: "Unas preguntas cortas para recomendarte cuándo y dónde hacer directos." },
      { target: "guia", title: "Guía de la semana", text: "Qué decir en cada directo. Márcalo como hecho al terminar." },
    ],
  },
  {
    id: "tendencias",
    label: "Tendencias",
    steps: [
      { target: "pagina", title: "Tendencias", text: "Ideas con lo que está de moda, con fecha límite." },
      { target: "pedir", title: "Pide ideas", text: "Toca el botón y te armo ideas para tu nicho. Tienes un número limitado al mes." },
      { target: "ideas", title: "Tus ideas", text: "Cada una dice si está subiendo o en su pico. Elige una y la llevas a tu semana." },
    ],
  },
  {
    id: "analizador",
    label: "Analizador",
    steps: [
      { target: "pagina", title: "Analizador de competencia", text: "Descubre por qué funcionan los reels de otras cuentas." },
      { target: "competidores", title: "Tus cuentas", text: "Agrega las cuentas de Instagram que admiras." },
      { target: "correr", title: "Analizar", text: "Corre el análisis. Puedes hacer uno por semana." },
      { target: "resultados", title: "Resultados", text: "Guarda las ideas que te gusten con la estrella." },
    ],
  },
];

export const tourById = (id: string) => TOURS.find((t) => t.id === id);
export const TOUR_IDS = TOURS.map((t) => t.id);

/** Guía que corresponde a una pantalla (null si no tiene). */
export function tourForPath(pathname: string, hasPiece: boolean): string | null {
  if (pathname === "/hoy") return "hoy";
  if (pathname === "/semana") return "semana";
  if (pathname === "/grabar") return hasPiece ? "grabar-estudio" : "grabar";
  if (pathname === "/progreso") return "progreso";
  if (pathname === "/mi-marca") return "mi-marca";
  if (pathname === "/carruseles") return "carruseles";
  if (pathname === "/directos") return "directos";
  if (pathname === "/tendencias") return "tendencias";
  if (pathname === "/analizador") return "analizador";
  return null;
}
