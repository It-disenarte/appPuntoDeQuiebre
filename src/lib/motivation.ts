// Frases motivacionales de la pantalla "Hoy". Banco escrito a mano (sin IA): cálidas, sin género y sin promesas de resultados.
// Se elige una por día y por momento de la semana, siempre la misma ese día (no cambia al recargar).

export type Moment = "constancia" | "arranque" | "racha" | "recupera" | "grabar" | "publicar";

export const PHRASES: Record<Moment, readonly string[]> = {
  /** Cualquier día: la idea de ir poco a poco. */
  constancia: [
    "Un video imperfecto publicado le gana a uno perfecto que nunca sale.",
    "No hace falta tener ganas: hace falta empezar. Las ganas suelen llegar después.",
    "Cada pieza que haces te enseña algo que no aprenderías sin hacerla.",
    "Ir poco a poco también es ir avanzando.",
    "Tu voz mejora cada vez que la usas.",
    "Lo que hoy te da pena, en unos meses será tu estilo.",
    "Hacer algo pequeño hoy pesa más que planear algo enorme para algún día.",
    "Nadie empezó sabiendo. Todos empezaron grabando.",
    "Tu público necesita lo que tú sabes, aunque a ti te parezca obvio.",
    "La constancia no se nota un día; se nota en un par de meses.",
    "Hoy basta con hacer tu parte de hoy.",
    "Lo que compartes puede ser justo lo que alguien estaba buscando.",
  ],
  /** Lunes o primer día de la semana. */
  arranque: [
    "Semana nueva, hoja en blanco. Ya tienes tu plan: solo toca seguirlo.",
    "Empieza por lo más pequeño de tu lista; lo demás se acomoda solo.",
    "Esta semana no tienes que hacerlo todo: tienes que hacer lo que sigue.",
    "Tu plan ya está listo. Lo único que falta es tu primera pieza.",
    "Una buena semana empieza con una sola acción hecha.",
    "Hoy es un buen día para dar el primer paso de la semana.",
  ],
  /** Lleva varios días seguidos. */
  racha: [
    "Mira tu racha: eso es constancia de verdad.",
    "Llevas varios días seguidos. Eso ya es un hábito en construcción.",
    "Quien eras hace un mes se alegraría de lo que estás haciendo hoy.",
    "Cada día que cumples le suma al siguiente. Sigue.",
    "La racha no es presión: es prueba de que sí puedes.",
    "Lo estás haciendo mejor de lo que crees.",
  ],
  /** Se saltó días o la racha se cortó. */
  recupera: [
    "Un día fallado no borra lo que ya hiciste. Hoy es otro día.",
    "Retomar también cuenta como constancia.",
    "No pasa nada por haberte saltado un día. Vuelve con algo pequeño.",
    "Empieza de nuevo sin culpa: lo importante es que regresaste.",
    "Las rachas se cortan; los hábitos se retoman. Hoy retomas.",
    "Elige la acción más fácil de hoy y haz solo esa.",
  ],
  /** Día de grabación. */
  grabar: [
    "Respira, lee tu guion una vez y graba. La primera toma casi nunca es la mala.",
    "No tiene que salir perfecto: tiene que salir. Después lo mejoras.",
    "Habla como le hablarías a una persona que te escucha con ganas.",
    "Si te equivocas, sigue; en la edición se arregla.",
    "Tu guion ya está hecho. Hoy solo toca decirlo.",
    "Una sonrisa antes de grabar se nota en la cámara.",
  ],
  /** Día de publicar. */
  publicar: [
    "Publicar da nervios. Publicar igual es lo que te hace avanzar.",
    "Hoy compartes algo que le puede servir a alguien. Eso ya vale.",
    "Una vez publicado, ya no es tuyo: es de quien lo necesite.",
    "No esperes el momento perfecto: el que cuenta es el de hoy.",
    "Publicar es soltar. Después solo toca mirar qué aprendiste.",
    "Tu contenido no tiene que gustarle a todos; tiene que servirle a alguien.",
  ],
};

const hash = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
};

/** Qué tipo de frase toca hoy según lo que está pasando. */
export function momentFor(o: { dow: number; streak: number; missedRecently: boolean; recordsToday: boolean; publishesToday: boolean }): Moment {
  if (o.publishesToday) return "publicar";
  if (o.recordsToday) return "grabar";
  if (o.streak >= 3) return "racha";
  if (o.missedRecently) return "recupera";
  if (o.dow === 0) return "arranque";
  return "constancia";
}

/** Una frase del banco: la misma durante todo el día (depende de la fecha y del tipo). */
export function phraseFor(moment: Moment, isoDate: string): string {
  const list = PHRASES[moment];
  return list[hash(`${isoDate}:${moment}`) % list.length]!;
}
