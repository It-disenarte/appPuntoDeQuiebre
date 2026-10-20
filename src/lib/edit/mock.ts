import { planSchema, type Plan, type Word } from "./schemas";

/** Palabras de PRUEBA (sin Gemini): se reparte el guion a lo largo del video para ver el flujo completo. */
export function mockWords(text: string, duration: number): Word[] {
  const ws = text.split(/\s+/).filter(Boolean);
  if (ws.length === 0 || duration <= 0) return [];
  const step = Math.max(0.2, Math.min(0.5, (duration - 1) / ws.length));
  return ws.map((w, i) => ({ texto: w, inicio_s: 0.5 + i * step, fin_s: 0.5 + (i + 1) * step - 0.03 }));
}

const first = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(0, n).join(" ");

/**
 * Plan por REGLAS (sin IA): corta pausas largas, agrupa subtítulos de 3 palabras, pone el gancho al inicio y la llamada a la
 * acción al final, y alterna planos. Sirve de respuesta de prueba y deja ver el render completo.
 */
export function mockPlan(words: Word[], duration: number, ctx: { hook: string; cta: string; topic: string; perLine?: number; highlight?: string }): Plan {
  const perLine = ctx.perLine ?? 3;
  const cortes: Plan["cortes"] = [];
  const startTalk = words[0]?.inicio_s ?? 0;
  if (startTalk > 0.6) cortes.push({ inicio_s: 0, fin_s: startTalk - 0.15, motivo: "saludo", texto: "" });
  for (let i = 1; i < words.length; i++) {
    const gap = words[i]!.inicio_s - words[i - 1]!.fin_s;
    if (gap > 0.5) cortes.push({ inicio_s: words[i - 1]!.fin_s + 0.15, fin_s: words[i]!.inicio_s, motivo: "silencio", texto: "" });
  }
  const end = words.at(-1)?.fin_s ?? duration;
  if (duration - end > 0.9) cortes.push({ inicio_s: end + 0.5, fin_s: duration, motivo: "cola", texto: "" });

  const lineas: Plan["subtitulos"]["lineas"] = [];
  for (let i = 0; i < words.length; i += perLine) {
    const chunk = words.slice(i, i + perLine);
    const text = chunk.map((w) => w.texto).join(" ");
    const hl = ctx.highlight && text.toLowerCase().includes(ctx.highlight.toLowerCase()) && lineas.length % 3 === 0 ? [ctx.highlight] : [];
    lineas.push({ inicio_s: chunk[0]!.inicio_s, fin_s: chunk.at(-1)!.fin_s + 0.1, texto: text, resaltar: hl });
  }
  const t0 = startTalk;
  const textos: Plan["textos_pantalla"] = [{ tipo: "gancho", inicio_s: t0, fin_s: t0 + 3, texto: first(ctx.hook || ctx.topic, 8), estilo: "ganchos" }];
  if (ctx.cta) textos.push({ tipo: "cta", inicio_s: Math.max(0, end - 3), fin_s: end + 0.4, texto: first(ctx.cta, 8), estilo: "" });
  const planos: Plan["encuadres"] = [];
  for (let t = t0, i = 0; t < end; t += 4, i++) planos.push({ inicio_s: t, fin_s: Math.min(end, t + 4), plano: i % 2 ? "cercano" : "normal" });
  return planSchema.parse({
    skill_version: "edicion-v1",
    modo: "a_camara",
    duracion_original_s: duration,
    cortes,
    subtitulos: { lineas },
    zooms: [{ inicio_s: t0, fin_s: t0 + 1.2, tipo: "golpe", motivo: "El gancho" }, ...(end > 8 ? [{ inicio_s: Math.max(0, end - 3), fin_s: end - 1.8, tipo: "golpe", motivo: "La frase del cierre" }] : [])],
    textos_pantalla: textos,
    encuadres: planos,
    portada: { segundo: Math.min(Math.max(0.5, t0 + 0.8), Math.max(0.5, duration - 0.5)), porque: "Cuadro nítido al inicio", titulo: first(ctx.topic, 7), resaltar: first(ctx.topic, 7).split(" ").sort((a, b) => b.length - a.length)[0] ?? "", elementos: [] },
    sugerencia_audio: "Si quieres música, busca algo suave y sin letra al publicar.",
    resumen: [`Quité ${Math.round(cortes.reduce((s, c) => s + (c.fin_s - c.inicio_s), 0))} s de pausas`, "Empecé con tu gancho en pantalla", "Puse subtítulos con tu estilo", "Esta es una edición de ejemplo hecha con reglas"],
    botones: ["Se ve bien, a mis textos", "Pedir un cambio", "Ver lo que quité"],
    dudas_transcripcion: [],
  });
}

/** Plan mixto por REGLAS (sin IA): un solo tramo hablado desde la primera hasta la última palabra, sin apoyos ni difuminados. */
export function mockMixtoPlan(words: Word[], duration: number, ctx: Parameters<typeof mockPlan>[2]): Plan {
  const base = mockPlan(words, duration, ctx);
  const start = Math.max(0, (words[0]?.inicio_s ?? 0) - 0.15);
  const end = Math.min(duration, (words.at(-1)?.fin_s ?? duration) + 0.5);
  return planSchema.parse({
    ...base,
    modo: "mixto",
    linea_de_tiempo: [{ tramo: 1, tipo: "habla", inicio_s: start, fin_s: end, audio: "propio", que_se_ve: "Tú hablando a cámara" }],
    privacidad: [],
    resumen: [...base.resumen.slice(0, 3), "Es una edición mixta de ejemplo: la IA real agrega apoyos y gancho prestado"],
  });
}
