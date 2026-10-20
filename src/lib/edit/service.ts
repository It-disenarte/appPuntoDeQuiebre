import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { randomUUID } from "node:crypto";
import { and, count, eq, gte, ne } from "drizzle-orm";
import { getLimits } from "@/lib/admin/limits";
import { claudeConfigured, claudeWithImages } from "@/lib/ai/claude";
import { geminiConfigured, geminiGenerate, parseJson } from "@/lib/ai/gemini";
import { getSubscription } from "@/lib/billing/service";
import { getManual, getVoiceProfile } from "@/lib/brujula/service";
import { db } from "@/lib/db";
import { aiCalls, videoEdits } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs";
import { getKit } from "@/lib/kit/service";
import { getPiece, parseScript } from "@/lib/plan/service";
import { sendToUser } from "@/lib/push";
import { getExport } from "@/lib/recording/join";
import { probeVideo, runFfmpeg } from "@/lib/recording/ffmpeg";
import { extractJson, runEdicion } from "@/lib/skills";
import type { VideoGuion } from "@/lib/skills/schemas";
import { deleteObject, getObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { resolveKitFont, stageFonts } from "./fonts";
import { mockMixtoPlan, mockPlan, mockWords } from "./mock";
import { audioArgs, buildFilterScript, coverArgs, editArgs, frameArgs } from "./render-args";
import { EMPTY_OVERRIDES, MAX_ADJUSTMENTS, normalizePlan, overridesSchema, planSchema, wordsSchema, type Overrides, type Plan, type Word } from "./schemas";
import { buildAss, buildCoverAss, checkPlan, planSegments, type AssStyleKit } from "./timeline";

export type Edit = typeof videoEdits.$inferSelect;
type Result = { ok: true } | { ok: false; error: string };

export const getEdit = async (userId: string, pieceId: string): Promise<Edit | null> => {
  const [e] = await db().select().from(videoEdits).where(and(eq(videoEdits.userId, userId), eq(videoEdits.pieceId, pieceId))).limit(1);
  return e ?? null;
};
export const parsePlan = (raw: unknown): Plan | null => {
  const r = planSchema.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseOverrides = (raw: unknown): Overrides => {
  const r = overridesSchema.safeParse(raw ?? {});
  return r.success ? r.data : EMPTY_OVERRIDES;
};
export const parseWords = (raw: unknown): Word[] => {
  const r = wordsSchema.safeParse(raw ?? {});
  return r.success ? r.data.palabras : [];
};
/** Una edición “atorada” (el worker se detuvo) se puede reintentar pasados 25 minutos. */
export const isStuck = (e: Edit, now = Date.now()) => (e.status === "planeando" || e.status === "renderizando") && now - e.updatedAt.getTime() > 25 * 60 * 1000;

const monthStart = (now = new Date()) => {
  const [y, m] = now.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }).split("-");
  return new Date(`${y}-${m}-01T06:00:00Z`);
};

export async function editQuota(userId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const [sub, limits] = await Promise.all([getSubscription(userId), getLimits()]);
  const [{ n }] = await db().select({ n: count() }).from(videoEdits).where(and(eq(videoEdits.userId, userId), ne(videoEdits.status, "error"), gte(videoEdits.createdAt, monthStart())));
  return { allowed: sub?.plan === "pro", used: n ?? 0, limit: limits.editsMonthlyPro };
}

/* ───────────── Pedir la edición ───────────── */

export async function requestEdit(userId: string, pieceId: string, mode: "a_camara" | "mixto" | "voz_en_off" = "a_camara"): Promise<Result> {
  if (mode === "voz_en_off") return (await import("./voiceover")).requestVoEdit(userId, pieceId);
  const q = await editQuota(userId);
  if (!q.allowed) return { ok: false, error: "La edición automática es del plan Pro." };
  const piece = await getPiece(userId, pieceId);
  if (!piece || piece.kind !== "video") return { ok: false, error: "Esa pieza no existe." };
  const exp = await getExport(userId, pieceId);
  if (exp?.status !== "lista") return { ok: false, error: "Primero arma tu video completo." };
  const cur = await getEdit(userId, pieceId);
  if (cur && !["error", "lista", "revision"].includes(cur.status) && !isStuck(cur)) return { ok: false, error: "Ya estamos trabajando en esta edición." };
  if (!cur && q.used >= q.limit) return { ok: false, error: `Ya usaste tus ${q.limit} ediciones de este mes. Se renuevan el día 1.` };
  if (cur) {
    // Volver a empezar desde cero (el cupo del mes ya se contó la primera vez).
    await db().update(videoEdits).set({ mode, status: "planeando", plan: null, words: null, overrides: EMPTY_OVERRIDES, adjustments: 0, adjustNote: null, error: null }).where(eq(videoEdits.id, cur.id));
    await enqueue("edicion.planear", userId, { editId: cur.id });
    return { ok: true };
  }
  const [row] = await db().insert(videoEdits).values({ userId, pieceId, mode }).returning({ id: videoEdits.id });
  await enqueue("edicion.planear", userId, { editId: row!.id });
  return { ok: true };
}

/* ───────────── Cambios del creador (sin IA) ───────────── */

async function mutateOverrides(userId: string, pieceId: string, fn: (o: Overrides, plan: Plan) => Overrides | string): Promise<Result> {
  const e = await getEdit(userId, pieceId);
  const plan = e && parsePlan(e.plan);
  if (!e || !plan || e.status !== "revision") return { ok: false, error: "Esta edición ya no se puede cambiar." };
  const next = fn(parseOverrides(e.overrides), plan);
  if (typeof next === "string") return { ok: false, error: next };
  await db().update(videoEdits).set({ overrides: next }).where(eq(videoEdits.id, e.id));
  return { ok: true };
}

export const toggleCut = (userId: string, pieceId: string, index: number) =>
  mutateOverrides(userId, pieceId, (o, plan) => {
    if (plan.modo === "mixto" || plan.modo === "voz_en_off") return "Los cortes de este modo se cambian con “Pedir un cambio”.";
    if (index < 0 || index >= plan.cortes.length) return "Ese corte no existe.";
    const restored = o.restored.includes(index) ? o.restored.filter((i) => i !== index) : [...o.restored, index];
    return { ...o, restored };
  });

export const setSubtitle = (userId: string, pieceId: string, index: number, text: string) =>
  mutateOverrides(userId, pieceId, (o, plan) => {
    if (index < 0 || index >= plan.subtitulos.lineas.length) return "Esa línea no existe.";
    const t = text.trim().slice(0, 200);
    if (!t) return "El subtítulo no puede quedar vacío.";
    return { ...o, subtitles: { ...o.subtitles, [String(index)]: t } };
  });

export const setTitle = (userId: string, pieceId: string, index: number, text: string) =>
  mutateOverrides(userId, pieceId, (o, plan) => {
    if (index < 0 || index >= plan.textos_pantalla.length) return "Ese texto no existe.";
    const t = text.trim().slice(0, 120);
    if (!t) return "El texto no puede quedar vacío.";
    return { ...o, titles: { ...o.titles, [String(index)]: t } };
  });

export const answerDoubt = (userId: string, pieceId: string, index: number, choice: "propuesta" | "escuche") =>
  mutateOverrides(userId, pieceId, (o, plan) => (index < 0 || index >= plan.dudas_transcripcion.length ? "Esa duda no existe." : { ...o, doubts: { ...o.doubts, [String(index)]: choice } }));

/** “Pedir un cambio” + nota: la IA vuelve a planear cambiando solo lo que se pidió (máximo 3 veces). */
export async function requestAdjust(userId: string, pieceId: string, nota: string): Promise<Result> {
  const e = await getEdit(userId, pieceId);
  if (!e || !["revision", "lista"].includes(e.status)) return { ok: false, error: "Esta edición no se puede ajustar ahora." };
  if (e.adjustments >= MAX_ADJUSTMENTS) return { ok: false, error: "Ya usaste los 3 ajustes. Puedes seguir cambiando textos y cortes a mano." };
  if (nota.trim().length < 3) return { ok: false, error: "Cuéntanos qué quieres cambiar." };
  await db().update(videoEdits).set({ status: "planeando", adjustments: e.adjustments + 1, adjustNote: nota.trim().slice(0, 300), error: null }).where(eq(videoEdits.id, e.id));
  await enqueue("edicion.planear", userId, { editId: e.id });
  return { ok: true };
}

/** “Se ve bien”: renderiza el video con los cortes, textos y respuestas actuales. */
export async function requestRender(userId: string, pieceId: string): Promise<Result> {
  const e = await getEdit(userId, pieceId);
  const plan = e && parsePlan(e.plan);
  if (!e || !plan || e.status !== "revision") return { ok: false, error: "Primero revisa el plan de edición." };
  if (plan.dudas_transcripcion.length > Object.keys(parseOverrides(e.overrides).doubts).length) return { ok: false, error: "Contesta las dudas de la transcripción antes de armar el video." };
  await db().update(videoEdits).set({ status: "renderizando", error: null }).where(eq(videoEdits.id, e.id));
  await enqueue("edicion.renderizar", userId, { editId: e.id });
  return { ok: true };
}

/* ───────────── Trabajo del worker ───────────── */

export async function logCall(userId: string, skill: string, mock: boolean, status: "ok" | "error", t?: { i?: number; o?: number }) {
  await db().insert(aiCalls).values({ userId, skill, skillVersion: `${skill}-v1`, mock, status, costCents: 0, inputTokens: t?.i ?? null, outputTokens: t?.o ?? null }).catch(() => undefined);
}

export async function downloadTo(key: string, file: string) {
  const obj = await getObject(key);
  if (!obj) throw new Error("No se encontró el video");
  await pipeline(Readable.fromWeb(obj.body as unknown as NodeWebStream), createWriteStream(file));
}

/** Transcripción con tiempos por palabra (Gemini). Los tiempos son del video original. */
export async function transcribeWords(audio: Buffer, hint: string): Promise<Word[]> {
  const prompt = `Transcribe este audio en español de México, palabra por palabra, con el segundo en que empieza y termina cada palabra. Respeta el nombre de la marca: ${hint}. No corrijas ni resumas lo que dice. Responde SOLO con JSON: {"palabras":[{"texto":"hola","inicio_s":0.52,"fin_s":0.8}]}`;
  const raw = await geminiGenerate([{ text: prompt }, { inline: { mime: "audio/mp3", data: audio } }], { json: true, timeoutMs: 150_000 });
  const parsed = wordsSchema.parse(parseJson(raw));
  if (parsed.palabras.length === 0) throw new Error("No se oyó voz en el video");
  return parsed.palabras;
}

const FALLBACK_KIT: AssStyleKit = { titleFont: "Poppins", textFont: "Nunito", textColor: "#FFFFFF", highlightColor: "#FE6807", titleColor: "#FFFFFF", detailColor: "#191BDF", boxColor: null, uppercase: false };

/** Estilo de subtítulos y títulos a partir del kit visual del creador (o uno neutro si aún no lo arma). */
export async function assKitOf(userId: string): Promise<{ kit: AssStyleKit; perLine: number; highlight: string; raw: Record<string, unknown> | null }> {
  const final = (await getKit(userId).catch(() => null))?.final ?? null;
  if (!final) return { kit: FALLBACK_KIT, perLine: 3, highlight: "", raw: null };
  const tv = final.titulos_video.find((t) => t.uso === "ganchos") ?? final.titulos_video[0]!;
  return {
    kit: {
      titleFont: final.tipografias.titulos.familia,
      textFont: final.tipografias.texto.familia,
      textColor: final.subtitulos.color_texto,
      highlightColor: final.subtitulos.color_resaltado,
      titleColor: tv.color_texto,
      detailColor: tv.color_detalle ?? final.colores.acento,
      boxColor: tv.caja === "solida" || tv.caja === "banda" ? (tv.color_detalle ?? final.colores.principal) : null,
      uppercase: tv.mayusculas,
    },
    perLine: final.subtitulos.palabras_por_linea,
    highlight: "",
    raw: { colores: final.colores, tipografias: final.tipografias, titulos_video: final.titulos_video, subtitulos: final.subtitulos, elementos: final.elementos.map((e) => e.id), preferencias_visuales: final.preferencias_visuales },
  };
}

/** Planea la edición: audio → palabras con tiempos → plan de la skill 13. Corre en el worker. */
export async function runPlan(userId: string, editId: string): Promise<void> {
  const [e] = await db().select().from(videoEdits).where(and(eq(videoEdits.id, editId), eq(videoEdits.userId, userId))).limit(1);
  if (!e) return;
  if (e.mode === "voz_en_off") return (await import("./voiceover")).runVoPlan(userId, editId);
  const piece = await getPiece(userId, e.pieceId);
  const parsed = piece ? parseScript("video", piece.script) : null;
  if (!piece || !parsed || !("cuerpo" in parsed)) throw new Error("La pieza ya no existe");
  const script = parsed as VideoGuion;
  const exp = await getExport(userId, e.pieceId);
  if (!exp?.objectKey) throw new Error("No hay video completo para editar");
  await db().update(videoEdits).set({ status: "planeando", error: null }).where(eq(videoEdits.id, editId));

  const dir = await mkdtemp(path.join(tmpdir(), "pdq-edit-"));
  try {
    const input = path.join(dir, "completo.mp4");
    await downloadTo(exp.objectKey, input);
    const info = await probeVideo(input);
    const duration = info.duration || exp.seconds || 0;

    // 1) Palabras con tiempos (se reutilizan si es un ajuste).
    let words = parseWords(e.words);
    let mock = false;
    if (words.length === 0) {
      if (geminiConfigured()) {
        const audio = path.join(dir, "audio.mp3");
        await runFfmpeg(audioArgs(input, audio));
        const [manual] = await Promise.all([getManual(userId).catch(() => null)]);
        words = await transcribeWords(await readFile(audio), manual?.content.frase_de_marca ? `Punto de Quiebre; frase de marca: ${manual.content.frase_de_marca}` : "Punto de Quiebre");
        await logCall(userId, "edicion-transcripcion", false, "ok");
      } else {
        words = mockWords([script.gancho, ...script.cuerpo, script.cierre].join(" "), duration);
        mock = true;
      }
    }

    // 2) Plan de la skill.
    const ak = await assKitOf(userId);
    const [manual, voice] = await Promise.all([getManual(userId).catch(() => null), getVoiceProfile(userId).catch(() => null)]);
    const previous = e.adjustments > 0 ? parsePlan(e.plan) : null;
    const input13 = {
      creador_id: userId,
      plan: "pro",
      modo: e.mode,
      video: { duracion_s: duration, red_destino: ["instagram"], formato: "reel" },
      pieza: { pilar: piece.pillar, tema: piece.topic, guion: { gancho: script.gancho, desarrollo: script.cuerpo.join(" "), cierre_cta: script.cierre } },
      transcripcion: { palabras: words },
      clips: [],
      kit_visual: ak.raw ?? {},
      brujula: { tono: manual?.content.tono ?? null, palabras_si: manual?.content.palabras_si ?? [] },
      perfil_voz: { muletillas_propias: (voice?.content.muletillas ?? []).map((m) => m.texto) },
      coach: null,
      ajuste: { numero: e.adjustments, anterior: previous, nota: e.adjustNote },
    };
    const ctx13 = { hook: script.gancho, cta: script.cierre, topic: piece.topic, perLine: ak.perLine, highlight: manual?.content.palabras_si?.[0] };
    let rawPlan: Plan;
    let planMock = mock;
    if (e.mode === "mixto") {
      // Modo mixto: la IA además VE el video (un fotograma cada 3 s) para elegir apoyos, gancho prestado y lo que hay que difuminar.
      if (claudeConfigured()) {
        const pattern = path.join(dir, "f-%03d.jpg");
        await runFfmpeg(frameArgs(input, pattern, 3, 50));
        const frames = (await readdir(dir)).filter((n) => n.startsWith("f-") && n.endsWith(".jpg")).sort();
        const images = await Promise.all(frames.map((n) => readFile(path.join(dir, n))));
        const skillText = await readFile(path.join(process.cwd(), "skills", "edicion", "v1", "skill.md"), "utf8");
        const mixInput = { ...input13, modo: "mixto", clips: [{ id: "c1", duracion_s: Math.round(duration * 10) / 10, fotogramas: frames.map((_, k) => ({ segundo: k * 3, url: "imagen adjunta, en orden" })), transcripcion: null }] };
        const resp = await claudeWithImages(skillText, `Entrada:\n${JSON.stringify(mixInput)}\n\nLas imágenes son los fotogramas del video, uno cada 3 segundos, en orden. Responde solo con el JSON de salida del modo mixto.`, images);
        rawPlan = { ...planSchema.parse(extractJson(resp.text)), modo: "mixto" };
        await logCall(userId, "edicion-mixto", false, "ok", { i: resp.inputTokens, o: resp.outputTokens });
      } else {
        rawPlan = mockMixtoPlan(words, duration, ctx13);
        planMock = true;
      }
    } else {
      const r = await runEdicion(userId, input13, planSchema, () => mockPlan(words, duration, ctx13));
      rawPlan = r.output;
      planMock = planMock || r.mock;
    }
    const plan = normalizePlan(rawPlan, duration);
    await db()
      .update(videoEdits)
      .set({ status: "revision", plan, words: { palabras: words }, duration: Math.round(duration), overrides: e.adjustments > 0 ? { ...EMPTY_OVERRIDES } : parseOverrides(e.overrides), mock: planMock, error: null })
      .where(eq(videoEdits.id, editId));
  } catch (err) {
    await db().update(videoEdits).set({ status: "error", error: (err instanceof Error ? err.message : "No se pudo planear la edición").slice(0, 300) }).where(eq(videoEdits.id, editId));
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Aplica las respuestas a las dudas de la transcripción sobre los subtítulos (sin tocar lo que el creador editó a mano). */
export function applyDoubts(plan: Plan, o: Overrides): Plan {
  const lineas = plan.subtitulos.lineas.map((l, i) => {
    if (o.subtitles[String(i)]) return l;
    let text = l.texto;
    plan.dudas_transcripcion.forEach((d, k) => {
      if (o.doubts[String(k)] === "propuesta" && d.escuche && text.toLowerCase().includes(d.escuche.toLowerCase())) text = text.replace(new RegExp(d.escuche.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), d.propuesta);
    });
    return text === l.texto ? l : { ...l, texto: text };
  });
  return { ...plan, subtitulos: { ...plan.subtitulos, lineas } };
}

/** Quema cortes, planos, subtítulos y textos con ffmpeg y genera la portada. Corre en el worker. */
export async function runRender(userId: string, editId: string): Promise<void> {
  const [e] = await db().select().from(videoEdits).where(and(eq(videoEdits.id, editId), eq(videoEdits.userId, userId))).limit(1);
  const plan0 = e && parsePlan(e.plan);
  if (!e || !plan0) return;
  if (e.mode === "voz_en_off") return (await import("./voiceover")).runVoRender(userId, editId);
  const exp = await getExport(userId, e.pieceId);
  if (!exp?.objectKey) throw new Error("No hay video completo para editar");
  await db().update(videoEdits).set({ status: "renderizando", error: null }).where(eq(videoEdits.id, editId));

  const dir = await mkdtemp(path.join(tmpdir(), "pdq-render-"));
  try {
    const o = parseOverrides(e.overrides);
    const plan = applyDoubts(plan0, o);
    const input = path.join(dir, "completo.mp4");
    await downloadTo(exp.objectKey, input);
    const info = await probeVideo(input);
    const duration = info.duration || e.duration || 0;
    const segs = planSegments(plan, o, duration);
    const ak = await assKitOf(userId);
    const [tf, xf] = await Promise.all([resolveKitFont(ak.kit.titleFont, "titulo"), resolveKitFont(ak.kit.textFont, "texto")]);
    const fontsDir = path.join(dir, "fonts");
    await mkdir(fontsDir);
    await stageFonts(fontsDir, [tf, xf]);
    const kit: AssStyleKit = { ...ak.kit, titleFont: tf.fullName, textFont: xf.fullName };

    const assPath = path.join(dir, "edicion.ass");
    await writeFile(assPath, buildAss({ plan, overrides: o, segs, kit }));
    const { script } = buildFilterScript({ segs, plan, assPath, fontsDir, lowRes: info.width > 0 && info.width < 1080 });
    const out = path.join(dir, "editado.mp4");
    await runFfmpeg(editArgs(input, script, out), 15 * 60 * 1000);

    let coverKey: string | null = null;
    if (plan.portada?.titulo) {
      const coverAss = path.join(dir, "portada.ass");
      await writeFile(coverAss, buildCoverAss(plan.portada.titulo, plan.portada.resaltar, kit));
      const cover = path.join(dir, "portada.png");
      await runFfmpeg(coverArgs(input, plan.portada.segundo, coverAss, fontsDir, cover));
      coverKey = `ediciones/${userId}/${e.pieceId}/portada-${randomUUID()}.png`;
      await putObjectStream(coverKey, createReadStream(cover), "image/png");
    }
    const outKey = `ediciones/${userId}/${e.pieceId}/${randomUUID()}.mp4`;
    await putObjectStream(outKey, createReadStream(out), "video/mp4");
    const secs = Math.round(segs.reduce((s, x) => s + (x.b - x.a), 0));
    for (const k of [e.outputKey, e.coverKey]) if (k) await deleteObject(k).catch(() => undefined);
    await db().update(videoEdits).set({ status: "lista", outputKey: outKey, coverKey, outputSeconds: secs, error: null }).where(eq(videoEdits.id, editId));
    await stat(out).catch(() => undefined);
    void sendToUser(userId, { title: "Tu video editado está listo", body: "Ya puedes verlo y descargarlo.", url: `/grabar?pieza=${e.pieceId}`, tag: `edicion-${e.pieceId}` }).catch(() => undefined);
  } catch (err) {
    await db().update(videoEdits).set({ status: "error", error: (err instanceof Error ? err.message : "No se pudo armar el video").slice(0, 300) }).where(eq(videoEdits.id, editId));
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function openEdited(userId: string, pieceId: string, what: "video" | "portada", range?: string) {
  const e = await getEdit(userId, pieceId);
  const key = what === "video" ? e?.outputKey : e?.coverKey;
  if (!e || e.status !== "lista" || !key || !storageConfigured()) return null;
  return getObject(key, range);
}

export const checkEdit = (e: Edit) => {
  const plan = parsePlan(e.plan);
  return plan ? checkPlan(plan, parseOverrides(e.overrides), e.duration ?? plan.duracion_original_s) : null;
};

