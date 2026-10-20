// Guías del asistente de inicio. Cada paso señala un elemento marcado con data-tour="…" (si no está en pantalla, se salta).
// Sin `target`, el paso sale centrado. Textos cortos: qué es y qué hacer. Los pasos con `click` llevan a la persona a tocar de verdad.

/** `click`: el paso pide tocar el elemento real y avanza al tocarlo. `path`: pantalla en la que ocurre (se espera a llegar a ella). */
export type TourStep = { target?: string; title: string; text: string; click?: boolean; path?: string };
export type Tour = { id: string; label: string; steps: TourStep[] };

export const TOURS: Tour[] = [
  {
    id: "inicio",
    label: "Cómo moverte por la app",
    steps: [
      { title: "Te enseño la app", text: "Vamos a recorrerla juntos tocando cada pestaña. Son 5 toques y puedes saltarlo cuando quieras." },
      { target: "nav-semana", click: true, path: "/hoy", title: "Toca Semana", text: "Tu parrilla: los videos y carruseles de la semana, cada uno con su guion." },
      { target: "nav-grabar", click: true, path: "/semana", title: "Toca Grabar", text: "Tu estudio. Lees el guion en el teleprompter y grabas desde el celular." },
      { target: "nav-progreso", click: true, path: "/grabar", title: "Toca Progreso", text: "Tus métricas explicadas fácil, y el analizador de competencia." },
      { target: "nav-mi-marca", click: true, path: "/progreso", title: "Toca Mi marca", text: "Tu perfil, tu voz, tu horario, tus avisos y tu plan." },
      { target: "nav-hoy", click: true, path: "/mi-marca", title: "Vuelve a Hoy", text: "Tu punto de partida cada día. Toca Hoy para empezar." },
    ],
  },
  {
    id: "configuracion",
    label: "Tu primera configuración",
    steps: [
      { title: "Primero, tu marca", text: "Son 4 pasos: tu historia, tu brújula, tu kit visual y tu horario. Te acompaño en cada uno." },
      { target: "siguiente-paso-boton", click: true, path: "/hoy", title: "Empieza aquí", text: "Toca el botón y te llevo al primer paso pendiente." },
    ],
  },
  {
    id: "hoy",
    label: "Hoy",
    steps: [
      { target: "pagina", title: "Tu día", text: "Aquí ves qué toca hoy. El número naranja es tu racha de días seguidos." },
      { target: "siguiente-paso", title: "Lo primero", text: "Completa los pasos de tu marca. Con ellos tus guiones suenan a ti." },
      { target: "metricas-pendientes", title: "Tus métricas", text: "Sube capturas de tu Instagram y te explico cómo te fue este mes." },
      { target: "racha", title: "Tu semana", text: "Un círculo por día. Naranja es cumplido; el azul es hoy." },
      { target: "tarea", title: "Tarea de hoy", text: "Lo que publicas hoy. Toca “Ver guion y textos” para ver qué decir." },
      { target: "historia", title: "Historia del día", text: "Una idea rápida para tus historias. Márcala cuando la publiques." },
      { target: "ir-estudio", click: true, path: "/hoy", title: "Ve al estudio", text: "Aquí ves cuándo grabas y abres la cámara. Toca “Ir al estudio”." },
    ],
  },
  {
    id: "semana",
    label: "Semana",
    steps: [
      { target: "pagina", title: "Tu parrilla", text: "Los videos y carruseles que publicas esta semana, uno por día." },
      { target: "generar", title: "Genera tu semana", text: "Toca el botón y la IA escribe tus guiones con tu voz. Tarda un par de minutos." },
      { target: "mezcla", title: "La mezcla", text: "Cuánto es viral, de nicho y de conversión. Se ajusta sola según tu etapa." },
      { target: "historias", title: "Historias", text: "Una idea por día. Úsala tal cual o cámbiala por una propia." },
      { target: "piezas", click: true, path: "/semana", title: "Abre una publicación", text: "Toca una para ver su guion y sus textos, y marcarla como publicada." },
    ],
  },
  {
    id: "grabar",
    label: "Grabar",
    steps: [
      { target: "pagina", title: "Tu estudio", text: "Aquí eliges qué video grabar." },
      { target: "videos", click: true, path: "/grabar", title: "Elige un video", text: "Toca uno para abrir su guion y la cámara. “Grabado” ya está listo." },
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
      { target: "analizador", click: true, path: "/progreso", title: "Abre el analizador", text: "Descubre por qué funcionan los reels de las cuentas que admiras. Tócalo." },
    ],
  },
  {
    id: "mi-marca",
    label: "Mi marca",
    steps: [
      { target: "pagina", title: "Mi marca", text: "Todo lo que te hace único: tu marca, tu voz, tu horario y tu cuenta." },
      { target: "plan", title: "Tu plan", text: "Tu suscripción y tus facturas." },
      { target: "brujula", title: "Brújula de marca", text: "Tu nicho, tus pilares y tu frase. Todo lo demás parte de aquí." },
      { target: "avisos", title: "Avisos", text: "Te recordamos cuándo grabar y publicar. Enciéndelos para no olvidarte." },
      { target: "lista", title: "Tus pasos", text: "Los pasos de tu marca. Los marcados “Listo” ya los terminaste." },
      { target: "atajos", click: true, path: "/mi-marca", title: "Prueba Tendencias", text: "Ideas con lo que está de moda. Toca “Ver tendencias”." },
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
  {
    id: "historia",
    label: "Tu historia",
    steps: [
      { target: "historia-progreso", title: "Paso 1: tu historia", text: "Una pregunta a la vez, hablando o escribiendo. Cualquiera se puede saltar." },
      { target: "historia-siguiente", click: true, path: "/mi-marca/historia", title: "Sigue", text: "Toca el botón para ir a la siguiente pregunta." },
    ],
  },
  {
    id: "historia-paso",
    label: "Responder una pregunta",
    steps: [{ target: "pregunta", title: "Cuéntamelo", text: "Habla o escribe como si se lo contaras a un amigo. No hay respuestas malas." }],
  },
  {
    id: "elecciones",
    label: "Elecciones rápidas",
    steps: [{ target: "pagina", title: "Último paso de tu historia", text: "Unos toques y listo. Con esto armo tu brújula." }],
  },
  {
    id: "manual",
    label: "Genera tu brújula",
    steps: [{ target: "generar-manual", click: true, path: "/mi-marca/manual", title: "Paso 2: tu brújula", text: "Con tu historia armo tu nicho, tu público, tus pilares y tu tono. Toca para generarla." }],
  },
  {
    id: "manual-revision",
    label: "Revisa tu brújula",
    steps: [{ target: "manual-seccion", title: "Revisa cada sección", text: "Lee y dime Sí si te representa, o pide un ajuste. Al aprobar las 5, queda lista." }],
  },
  {
    id: "kit",
    label: "Tu kit visual",
    steps: [
      { target: "pagina", title: "Paso 3: tu kit visual", text: "Eliges jugando colores, letras y estilo de títulos. Son 5 rondas rápidas." },
      { target: "kit-siguiente", click: true, path: "/mi-marca/kit", title: "Empieza", text: "Toca para ir a la primera ronda." },
    ],
  },
  {
    id: "horario",
    label: "Tu horario",
    steps: [
      { target: "horario-info", title: "Paso 4: tu horario", text: "Apartamos días fijos para grabar. Elige los que sí puedas cumplir, aunque sean pocos." },
      { target: "horario-form", title: "Respóndelo", text: "Contesta y guarda. Te propongo un horario para que lo aceptes." },
    ],
  },
  {
    id: "horario-propuesta",
    label: "Acepta tu horario",
    steps: [{ target: "horario-aceptar", click: true, path: "/mi-marca/horario", title: "Tu propuesta", text: "Si te acomoda, acéptala y te avisamos antes de cada sesión." }],
  },
  {
    id: "voz",
    label: "Tu perfil de voz",
    steps: [{ target: "pagina", title: "Tu perfil de voz", text: "Describe cómo hablas para que todo lo que escribo suene a ti. Se arma con tu historia." }],
  },
];

export const tourById = (id: string) => TOURS.find((t) => t.id === id);
export const TOUR_IDS = TOURS.map((t) => t.id);

/** Guías que corresponden a una pantalla, en orden de prioridad (se lanza la primera que no ha visto y tenga algo que mostrar). */
export function toursForPath(pathname: string, hasPiece: boolean): string[] {
  if (pathname === "/hoy") return ["configuracion", "hoy"];
  if (pathname === "/semana") return ["semana"];
  if (pathname === "/grabar") return [hasPiece ? "grabar-estudio" : "grabar"];
  if (pathname === "/progreso") return ["progreso"];
  if (pathname === "/mi-marca") return ["mi-marca"];
  if (pathname === "/carruseles") return ["carruseles"];
  if (pathname === "/directos") return ["directos"];
  if (pathname === "/tendencias") return ["tendencias"];
  if (pathname === "/analizador") return ["analizador"];
  if (pathname === "/mi-marca/historia") return ["historia"];
  if (/^\/mi-marca\/historia\/(?!elecciones$)[^/]+$/.test(pathname)) return ["historia-paso"];
  if (pathname === "/mi-marca/historia/elecciones") return ["elecciones"];
  if (pathname === "/mi-marca/manual") return ["manual", "manual-revision"];
  if (pathname === "/mi-marca/kit") return ["kit"];
  if (pathname === "/mi-marca/horario") return ["horario", "horario-propuesta"];
  if (pathname === "/mi-marca/voz") return ["voz"];
  return [];
}
