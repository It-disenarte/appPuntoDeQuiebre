import type { CoachOut } from "./schemas";

/** Revisión de PRUEBA (sin Gemini): se ve el flujo completo sin gastar IA. */
export function mockReview(numero: number, hook: string): CoachOut {
  if (numero >= 2) {
    return {
      skill_version: "coach-video-v1",
      numero_revision: 2,
      veredicto: "listo",
      titular: "Esta toma ya está lista para salir",
      logro: { area: "gancho", segundo: 1, texto: "Ahora arrancas directo con tu gancho, sin saludo. (Revisión de ejemplo.)" },
      mejoras: [],
      comparacion: { mejoro: ["El gancho ahora va primero"], sigue_pendiente: [] },
      cierre: "Ya hiciste el ajuste. Publícalo con confianza.",
      botones: ["Seguir a mis textos"],
    };
  }
  return {
    skill_version: "coach-video-v1",
    numero_revision: 1,
    veredicto: "otra_toma_opcional",
    titular: "Buena energía; el arranque puede ser más directo",
    logro: { area: "forma_de_hablar", segundo: 12, texto: "Tu energía se mantiene firme en el cuerpo del video. (Revisión de ejemplo.)" },
    mejoras: [
      { area: "gancho", segundo: 0, que_paso: "Empiezas con un saludo antes del gancho.", como_mejorarlo: "Empieza directo con tu primera frase y deja el saludo para el final.", frase_sugerida: hook || null },
      { area: "tecnica", segundo: 0, que_paso: "La luz viene de atrás de ti.", como_mejorarlo: "Gira para que la ventana quede de frente y sube un poco el celular.", frase_sugerida: null },
    ],
    comparacion: null,
    cierre: "Puedes grabar otra toma con estos ajustes o publicarla así: tú decides.",
    botones: ["Grabar otra toma", "Publicar así"],
  };
}
