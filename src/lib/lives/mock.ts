import type { GuideOut, Live, Recommendation } from "./schemas";

const TITLES = ["Lo que nadie te cuenta de empezar", "Pregúntame lo que quieras", "Esto o aquello: tú decides", "Reaccionamos a sus comentarios", "El reto de hoy en vivo"];

export function mockRecommendation(redes: string[], current: string | null): Recommendation {
  const pick = ["tiktok", "youtube", "instagram", "facebook"].find((p) => redes.includes(p)) ?? current ?? "tiktok";
  const why: Record<string, string> = {
    tiktok: "Es la mejor para que te descubran personas nuevas: tus directos aparecen en Para ti.",
    youtube: "Descubrimiento lento al inicio, pero la grabación se queda y te encuentran por búsqueda.",
    instagram: "Sirve sobre todo para conectar con quien ya te sigue; mejor aún si lo haces con otro creador.",
    facebook: "Alcance medio, sobre todo con público adulto y en grupos.",
  };
  return { texto: "Empieza con un directo por semana, el mismo día y a la misma hora. La constancia importa más que la cantidad. (Recomendación de ejemplo.)", plataforma_sugerida: pick, por_que_esa_app: why[pick] ?? "Elige donde ya está tu comunidad.", frecuencia_sugerida: "1 directo por semana, siempre el mismo día y a la misma hora", duracion_sugerida_min: 30 };
}

export function mockGuide(days: string[], pilares: string[], platform: string): GuideOut {
  const lives: Live[] = days.map((dia, i) => ({
    dia,
    plataforma: platform,
    tipo: "ancla" as const,
    titulo: TITLES[i % TITLES.length]!,
    pilar: pilares[i % Math.max(1, pilares.length)] ?? "",
    objetivo: "conectar" as const,
    apertura: "Saluda, cuenta de qué va el directo y pide que te digan desde dónde te ven.",
    puntos_para_hablar: ["Tu historia en 1 minuto", "Un error común y cómo evitarlo", "Una pregunta para el chat"],
    preguntas_para_el_publico: ["¿Desde dónde me ves?", "¿Qué te gustaría que hablemos la próxima vez?"],
    dinamica: { nombre: "Esto o aquello", como_se_juega: "Das dos opciones y el chat vota con 1 o 2." },
    si_llega_hate: "Respira, responde con humor ligero o ignóralo; no discutas.",
    cierre: "Agradece, recuerda tu próximo directo y pide que te sigan.",
    clip_para_reel: "El momento en que respondes la pregunta del clip.",
    momento_clip: { pregunta: "¿Qué harías distinto si empezaras hoy?", frase_marca: "esto va para clip", como_decirlo: "Dilo antes de responder y contesta en 45 a 60 segundos, empezando por el gancho." },
  }));
  return { skill_version: "guia-lives-v2", mes: null, lives_sugeridos: lives.length, lives, comodines: ["Responder preguntas del chat", "Contar una anécdota de la semana"] };
}
