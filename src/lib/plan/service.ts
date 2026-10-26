import "server-only";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { getIntake, getManual, getSchedule, getVoiceProfile } from "@/lib/brujula/service";
import { db } from "@/lib/db";
import { contentPieces, igConnections, storyIdeas, users, weekPlans } from "@/lib/db/schema";
import { getSubscription } from "@/lib/billing/service";
import { ideasForWeek, markIdeasUsed, type BankIdea } from "@/lib/ideas/bank";
import { runHistorias, runParrilla, runTextos } from "@/lib/skills";
import { carruselGuionSchema, videoGuionSchema, type CarruselGuion, type HistoriasV2, type TextosV2, type VideoGuion } from "@/lib/skills/schemas";
import { textosV2Output } from "@/lib/skills/schemas";
import type { HistoriasInput, ParrillaInput, TextosInput } from "./mock";
import { addDays, DAY_CODES, mixFor, planSlots, stageFor, targetWeek, textMode, todayIso, type Category, type Mix, type PlanId, type Slot, type Stage } from "./rules";

/* ───────────── Lectura ───────────── */

export type Piece = typeof contentPieces.$inferSelect;
export type PlanRow = typeof weekPlans.$inferSelect;
export type StoryRow = typeof storyIdeas.$inferSelect;

export const mixSchema = z.object({ viral: z.number(), nicho: z.number(), conversion: z.number() });
export const focusSchema = z.object({ temas: z.array(z.string()).default([]), tipos_apagados: z.array(z.object({ tipo: z.string(), hasta: z.string() })).default([]) }).default({ temas: [], tipos_apagados: [] });

export async function getPlan(userId: string, weekStart: string) {
  const [plan] = await db().select().from(weekPlans).where(and(eq(weekPlans.userId, userId), eq(weekPlans.weekStart, weekStart))).limit(1);
  if (!plan) return null;
  const [pieces, stories] = await Promise.all([
    db().select().from(contentPieces).where(eq(contentPieces.planId, plan.id)).orderBy(asc(contentPieces.n)),
    db().select().from(storyIdeas).where(eq(storyIdeas.planId, plan.id)).orderBy(asc(storyIdeas.day)),
  ]);
  return { plan, pieces, stories };
}

/** La semana que está vigente hoy (la que contiene la fecha de hoy), si existe. */
export async function getCurrentPlan(userId: string, today = todayIso()) {
  const rows = await db().select({ weekStart: weekPlans.weekStart }).from(weekPlans).where(and(eq(weekPlans.userId, userId), gte(weekPlans.weekStart, addDays(today, -6)))).orderBy(asc(weekPlans.weekStart));
  const current = rows.find((r) => r.weekStart <= today && addDays(r.weekStart, 6) >= today) ?? rows[0] ?? null;
  return current ? getPlan(userId, current.weekStart) : null;
}

export async function listWeeks(userId: string) {
  return db().select({ weekStart: weekPlans.weekStart, id: weekPlans.id }).from(weekPlans).where(eq(weekPlans.userId, userId)).orderBy(desc(weekPlans.weekStart)).limit(12);
}

export async function getPiece(userId: string, id: string): Promise<Piece | null> {
  const [p] = await db().select().from(contentPieces).where(and(eq(contentPieces.id, id), eq(contentPieces.userId, userId))).limit(1);
  return p ?? null;
}

export const parseScript = (kind: "video" | "carrusel", raw: unknown): VideoGuion | CarruselGuion | null => {
  const r = (kind === "video" ? videoGuionSchema : carruselGuionSchema).safeParse(raw);
  return r.success ? r.data : null;
};
export const parseTexts = (raw: unknown): TextosV2 | null => {
  const r = textosV2Output.safeParse(raw);
  return r.success ? r.data : null;
};

/* ───────────── Requisitos para generar ───────────── */

export async function planReadiness(userId: string) {
  const [manual, voice, schedule, intake] = await Promise.all([getManual(userId), getVoiceProfile(userId), getSchedule(userId), getIntake(userId)]);
  const missing: { text: string; href: string }[] = [];
  if (manual?.status !== "aprobado") missing.push({ text: "Aprueba tu brújula de marca", href: "/mi-marca/manual" });
  if (!voice) missing.push({ text: "Genera tu perfil de voz", href: "/mi-marca/historia" });
  if (!schedule?.acceptedAt) missing.push({ text: "Acepta tu horario de grabación", href: "/mi-marca/horario" });
  return { ready: missing.length === 0, missing, manual, voice, schedule, intake };
}

/* ───────────── Generación de la semana ───────────── */

const bankItem = (i: BankIdea) => ({ titulo: i.title, gancho: i.hook, idea: i.idea, guion_corto: i.shortScript, inspirada_en: i.creator });
const bankNote = (bank: BankIdea[]) => (bank.length === 0 ? null : "Ideas guardadas por el creador para esta semana (toma cada una como base de un guion con su gancho): " + bank.map((b, k) => String(k + 1) + ") " + b.title).join("; "));

/**
 * Guion de video completo para UNA idea (la del banco): usa la misma skill de la parrilla con una semana de una sola pieza.
 * No agrega nada a la base: eso lo hace quien llama.
 */
export async function singleVideoScript(userId: string, idea: { title: string; hook: string; idea: string; shortScript?: string | null }): Promise<{ ok: true; pillar: string; script: VideoGuion; mock: boolean } | { ok: false; error: string }> {
  const r = await planReadiness(userId);
  if (!r.ready || !r.manual || !r.voice) return { ok: false, error: "Termina primero tu brújula, tu perfil de voz y tu horario." };
  const m = r.manual.content;
  const v = r.voice.content;
  const recent = await db().select({ topic: contentPieces.topic }).from(contentPieces).where(eq(contentPieces.userId, userId)).orderBy(desc(contentPieces.createdAt)).limit(24);
  const input: ParrillaInput = {
    creador_id: userId,
    brujula: { nicho: m.nicho, publico: m.publico, pilares: m.pilares, tono: m.tono, palabras_si: m.palabras_si, palabras_no: m.palabras_no, postura: m.postura, estilo_grabacion: m.estilo_grabacion, lives: m.lives },
    perfil_voz: { formalidad: v.formalidad, ritmo: v.ritmo, palabras_frecuentes: v.palabras_frecuentes, muletillas: v.muletillas, frases_firma: v.frases_firma, como_aconseja: v.como_aconseja, evitar: v.evitar, reglas_para_guiones: [...v.reglas_para_guiones, ...(await learned(userId)).rules], preferencias_aprendidas: v.preferencias_aprendidas },
    semana: [{ n: 1, dia: DAY_CODES[0]!, formato: "video", categoria: "nicho", tipo: "probado", variante_de: null, prueba: null }],
    temas_recientes: recent.map((x) => x.topic),
    enfoque: "Escribe el guion completo de UN video basado en esta idea guardada por el creador: «" + idea.title + "». Gancho de referencia: «" + idea.hook + "». " + idea.idea,
    ideas_guardadas: [{ titulo: idea.title, gancho: idea.hook, idea: idea.idea, guion_corto: idea.shortScript ?? null, inspirada_en: null }],
  };
  const out = await runParrilla(userId, input);
  const piece = out.output.piezas[0];
  const parsed = piece ? videoGuionSchema.safeParse(piece.guion) : null;
  if (!piece || !parsed?.success) return { ok: false, error: "La IA no devolvió un guion de video. Inténtalo de nuevo." };
  return { ok: true, pillar: String(piece.pilar ?? ""), script: parsed.data, mock: out.mock };
}

/** Lo aprendido del creador (skill 10), cargado aparte para no crear un ciclo de importaciones. */
async function learned(userId: string) {
  const l = await import("@/lib/learning/service");
  return { rules: await l.learnedRules(userId), mix: (base: Mix) => l.learnedMix(userId, base) };
}

export type GenerateResult = { ok: true; weekStart: string } | { ok: false; error: string };

export async function generatePlan(userId: string, opts: { weekStart?: string; focus?: { temas: string[]; tipos_apagados: { tipo: string; hasta: string }[] } } = {}): Promise<GenerateResult> {
  const weekStart = opts.weekStart ?? targetWeek();
  const existing = await getPlan(userId, weekStart);
  if (existing) return { ok: true, weekStart };

  const r = await planReadiness(userId);
  if (!r.ready || !r.manual || !r.voice) return { ok: false, error: "Termina primero tu brújula, tu perfil de voz y tu horario." };

  const [user] = await db().select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
  const sub = await getSubscription(userId);
  const tier: PlanId = sub?.plan === "pro" ? "pro" : "basico";
  const hasOffer = r.intake?.story.sell?.mode === "hoy";
  const ageDays = Math.floor((Date.now() - (user?.createdAt.getTime() ?? Date.now())) / 86_400_000);
  const ig = await db().select({ profile: igConnections.profile }).from(igConnections).where(eq(igConnections.userId, userId)).limit(1);
  const followers = Number((ig[0]?.profile as { followers?: number } | undefined)?.followers ?? 0) || null;
  const stage: Stage = stageFor({ followers, accountAgeDays: ageDays });
  const mix: Mix = await (await learned(userId)).mix(mixFor(stage, hasOffer));
  const publishTime = r.schedule?.result.publicar.hora ?? "18:00";
  const slots = planSlots({ plan: tier, weekStart, mix });
  // Ideas guardadas en el banco: la parrilla las toma como base de algún guion (hasta 3 por semana).
  const bank = await ideasForWeek(userId, 3);

  const recent = await db()
    .select({ topic: contentPieces.topic })
    .from(contentPieces)
    .where(eq(contentPieces.userId, userId))
    .orderBy(desc(contentPieces.createdAt))
    .limit(24);

  const m = r.manual.content;
  const v = r.voice.content;
  const parrillaInput: ParrillaInput = {
    creador_id: userId,
    brujula: { nicho: m.nicho, publico: m.publico, pilares: m.pilares, tono: m.tono, palabras_si: m.palabras_si, palabras_no: m.palabras_no, postura: m.postura, estilo_grabacion: m.estilo_grabacion, lives: m.lives },
    perfil_voz: { formalidad: v.formalidad, ritmo: v.ritmo, palabras_frecuentes: v.palabras_frecuentes, muletillas: v.muletillas, frases_firma: v.frases_firma, como_aconseja: v.como_aconseja, evitar: v.evitar, reglas_para_guiones: [...v.reglas_para_guiones, ...(await learned(userId)).rules], preferencias_aprendidas: v.preferencias_aprendidas },
    semana: slots.map((s) => ({ n: s.n, dia: s.day, formato: s.kind, categoria: s.category, tipo: s.type, variante_de: s.variantOf, prueba: s.testKind })),
    temas_recientes: recent.map((x) => x.topic),
    enfoque: [opts.focus?.temas.join(", ") || null, bankNote(bank)].filter(Boolean).join(". ") || null,
    ...(bank.length > 0 ? { ideas_guardadas: bank.map(bankItem) } : {}),
  };
  const parrilla = await runParrilla(userId, parrillaInput);
  const byN = new Map(parrilla.output.piezas.map((p) => [p.n, p]));

  const focus = opts.focus ?? { temas: [], tipos_apagados: [] };
  const historiasInput: HistoriasInput = {
    creador_id: userId,
    brujula: { nicho: m.nicho, pilares: m.pilares, palabras_si: m.palabras_si, palabras_no: m.palabras_no, lives: m.lives },
    perfil_voz: { frases_firma: v.frases_firma, como_aconseja: v.como_aconseja, preferencias_aprendidas: v.preferencias_aprendidas },
    horario: { bloques: (r.schedule?.result.bloques ?? []).map((b) => ({ tipo: b.tipo, dia: b.dia })) },
    parrilla_semana: slots.filter((s) => s.kind === "video").map((s) => ({ dia: DAY_CODES[slots.indexOf(s)]!, tipo: "reel" as const, tema: byN.get(s.n)?.tema ?? "", publica: publishTime })),
    historial: [],
    enfoque_semana: focus,
  };
  const historias = await runHistorias(userId, historiasInput);

  const mock = parrilla.mock || historias.mock;
  await db().transaction(async (tx) => {
    const [plan] = await tx
      .insert(weekPlans)
      .values({ userId, weekStart, tier, stage, mix, summary: parrilla.output.resumen_semana, focus, mock, skillVersion: parrilla.skillVersion })
      .onConflictDoNothing()
      .returning({ id: weekPlans.id });
    if (!plan) return; // otra pestaña ya la creó
    const rows = slots.map((s: Slot) => {
      const p = byN.get(s.n);
      const base = s.variantOf !== null ? byN.get(s.variantOf) : null;
      return {
        planId: plan.id,
        userId,
        n: s.n,
        day: s.day,
        publishTime,
        kind: s.kind,
        category: s.category,
        type: s.type,
        variantOfN: s.variantOf,
        testKind: s.testKind,
        pillar: String(p?.pillar ?? base?.pillar ?? "—"),
        topic: String(p?.tema ?? base?.tema ?? "Por definir"),
        idea: String(p?.idea ?? base?.idea ?? ""),
        script: p?.guion ?? base?.guion ?? { gancho: "", cuerpo: ["Por definir"], cierre: "" },
        variant: p?.variante ?? null,
        testCard: p?.tarjeta_prueba ?? null,
      };
    });
    await tx.insert(contentPieces).values(rows);
    const stories = historias.output.semana.map((s) => {
      const idx = DAY_CODES.indexOf(s.dia as (typeof DAY_CODES)[number]);
      return { planId: plan.id, userId, day: addDays(weekStart, Math.max(0, idx)), data: s };
    });
    await tx.insert(storyIdeas).values(stories);
  });
  // Las ideas del banco ya se tomaron en cuenta para esta semana.
  await markIdeasUsed(bank.map((b) => b.id));
  return { ok: true, weekStart };
}

/* ───────────── Textos de publicación (por pieza) ───────────── */

const reviewSchema = z.object({ modo: z.enum(["aprendizaje", "rapido"]), votos: z.record(z.string(), z.enum(["si", "editado", "no"])).default({}), ganchoElegido: z.number().int().default(0), edits: z.record(z.string(), z.string()).default({}) });
export type TextsReview = z.infer<typeof reviewSchema>;
export const parseReview = (raw: unknown): TextsReview | null => {
  const r = reviewSchema.safeParse(raw);
  return r.success ? r.data : null;
};

export async function generateTexts(userId: string, pieceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const piece = await getPiece(userId, pieceId);
  if (!piece) return { ok: false, error: "Esa pieza no existe." };
  const [manual, voice, intake] = await Promise.all([getManual(userId), getVoiceProfile(userId), getIntake(userId)]);
  if (!manual || !voice) return { ok: false, error: "Falta tu brújula o tu perfil de voz." };
  const redes = (intake?.quick?.redes ?? ["instagram"]).filter((r) => ["instagram", "tiktok", "facebook"].includes(r));
  if (redes.length === 0) return { ok: false, error: "Elige al menos una red (Instagram, TikTok o Facebook) en tus elecciones rápidas." };

  const script = parseScript(piece.kind, piece.script);
  const guion = script
    ? piece.kind === "video"
      ? [(script as VideoGuion).gancho, ...(script as VideoGuion).cuerpo, (script as VideoGuion).cierre].join(" ")
      : [(script as CarruselGuion).titulo, ...(script as CarruselGuion).puntos, (script as CarruselGuion).cierre].join(". ")
    : piece.topic;

  const done = await db().select({ review: contentPieces.textsReview }).from(contentPieces).where(and(eq(contentPieces.userId, userId), inArray(contentPieces.status, ["grabado", "programado", "publicado", "pendiente"]))).orderBy(desc(contentPieces.updatedAt)).limit(40);
  const reviewed = done.map((d) => parseReview(d.review)).filter((x): x is TextsReview => Boolean(x));
  const modo = textMode(reviewed.length, reviewed.map((r) => Object.values(r.votos).includes("editado")));

  const input: TextosInput = {
    creador_id: userId,
    pieza: { tipo: piece.kind === "video" ? "reel" : "carrusel", guion, pilar: piece.pillar, categoria: piece.category as Category, redes },
    brujula: { nicho: manual.content.nicho, palabras_si: manual.content.palabras_si, palabras_no: manual.content.palabras_no, postura: manual.content.postura, vision: manual.content.vision },
    perfil_voz: { frases_firma: voice.content.frases_firma, como_aconseja: voice.content.como_aconseja, preferencias_aprendidas: voice.content.preferencias_aprendidas },
    historial_hashtags: [],
    modo,
  };
  const res = await runTextos(userId, input);
  const review: TextsReview = { modo, votos: {}, ganchoElegido: res.output.gancho_elegido ?? 0, edits: {} };
  await db().update(contentPieces).set({ texts: res.output, textsReview: review }).where(eq(contentPieces.id, piece.id));
  return { ok: true };
}

/** Guarda lo que el creador eligió o editó en los textos (gancho, 👍 ✏️ 👎 por red, texto editado). */
export async function reviewTexts(userId: string, pieceId: string, change: { gancho?: number; network?: "instagram" | "tiktok" | "facebook"; voto?: "si" | "editado" | "no"; edited?: string }): Promise<boolean> {
  const piece = await getPiece(userId, pieceId);
  const review = piece ? parseReview(piece.textsReview) : null;
  if (!piece || !review) return false;
  const next: TextsReview = { ...review, votos: { ...review.votos }, edits: { ...review.edits } };
  if (change.gancho !== undefined) next.ganchoElegido = change.gancho;
  if (change.network && change.voto) {
    next.votos[change.network] = change.voto;
    if (change.edited !== undefined) next.edits[change.network] = change.edited.slice(0, 4000);
  }
  await db().update(contentPieces).set({ textsReview: next }).where(eq(contentPieces.id, piece.id));
  return true;
}

export async function setPieceStatus(userId: string, pieceId: string, status: Piece["status"]): Promise<boolean> {
  const r = await db().update(contentPieces).set({ status }).where(and(eq(contentPieces.id, pieceId), eq(contentPieces.userId, userId))).returning({ id: contentPieces.id });
  return r.length > 0;
}

/* ───────────── Historias ───────────── */

export type StoryData = HistoriasV2["semana"][number];
export const storyDataSchema = z
  .object({ dia: z.string(), tipo: z.string(), idea: z.string(), texto_sugerido: z.string().default(""), sticker: z.string().nullable().default(null), minutos: z.number().default(3), tema_enfoque: z.string().nullable().default(null), alternativas: z.array(z.object({ tipo: z.string(), idea: z.string(), texto_sugerido: z.string().default(""), sticker: z.string().nullable().default(null) })).default([]) })
  .passthrough();

export async function updateStory(userId: string, id: string, change: { next?: boolean; vote?: StoryRow["vote"]; edited?: string; own?: string; done?: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db().select().from(storyIdeas).where(and(eq(storyIdeas.id, id), eq(storyIdeas.userId, userId))).limit(1);
  if (!row) return { ok: false, error: "Esa idea no existe." };
  const data = storyDataSchema.safeParse(row.data);
  if (!data.success) return { ok: false, error: "La idea está dañada." };
  const set: Partial<typeof storyIdeas.$inferInsert> = {};
  if (change.next) {
    // "Otra idea": las alternativas se recorren en orden y al llegar al final vuelven a la primera.
    const total = data.data.alternativas.length + 1;
    set.altIndex = (row.altIndex + 1) % Math.max(1, Math.min(total, 21));
    set.vote = null;
    set.editedText = null;
  }
  if (change.vote !== undefined) set.vote = change.vote;
  if (change.edited !== undefined) set.editedText = change.edited.slice(0, 600);
  if (change.own !== undefined) {
    const words = change.own.trim().split(/\s+/).filter(Boolean).length;
    if (words < 15) return { ok: false, error: `Cuéntanos un poco más (mínimo 15 palabras; llevas ${words}).` };
    set.ownIdea = change.own.trim().slice(0, 600);
  }
  if (change.done !== undefined) set.done = change.done;
  await db().update(storyIdeas).set(set).where(eq(storyIdeas.id, row.id));
  return { ok: true };
}

export function currentStory(row: StoryRow): { tipo: string; idea: string; texto: string; sticker: string | null; minutos: number; own: boolean; total: number } | null {
  const d = storyDataSchema.safeParse(row.data);
  if (!d.success) return null;
  if (d.data.tipo === "idea_propia") return { tipo: "Tu idea", idea: row.ownIdea ?? d.data.idea, texto: "", sticker: null, minutos: d.data.minutos, own: true, total: 0 };
  const alt = row.altIndex > 0 ? d.data.alternativas[row.altIndex - 1] : null;
  const src = alt ?? d.data;
  return { tipo: src.tipo, idea: src.idea, texto: row.editedText ?? src.texto_sugerido ?? "", sticker: src.sticker ?? null, minutos: d.data.minutos, own: false, total: d.data.alternativas.length + 1 };
}

/** Lo que corre el worker para "Generar mi semana": igual que siempre, pero si no se pudo el trabajo queda en error con su motivo. */
export async function runWeekJob(userId: string, payload: { week?: string; focus?: { temas: string[]; tipos_apagados: { tipo: string; hasta: string }[] } }): Promise<void> {
  const r = await generatePlan(userId, { weekStart: payload.week, focus: payload.focus });
  if (!r.ok) throw new Error(r.error);
}
