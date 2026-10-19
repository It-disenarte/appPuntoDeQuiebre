import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { and, desc, eq, inArray, lt, ne } from "drizzle-orm";
import sharp from "sharp";
import { claudeConfigured, claudeText } from "@/lib/ai/claude";
import { geminiConfigured, geminiGenerate, geminiUploadFile, parseJson } from "@/lib/ai/gemini";
import { getLimits } from "@/lib/admin/limits";
import { getIntake, getManual } from "@/lib/brujula/service";
import { db } from "@/lib/db";
import { aiCalls, analyzedVideos, analyzerRuns, competitors } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs";
import { sendToUser } from "@/lib/push";
import { deleteObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { apifyConfigured, scrapeReels, type ScrapedReel } from "./apify";
import { downloadLimited, MAX_THUMB_BYTES, MAX_VIDEO_BYTES } from "./media";
import { conceptsSchema, DEFAULT_PARAMS, MAX_COMPETITORS, normalizeUsername, paramsSchema, progressSchema, videoAnalysisSchema, type Concepts, type Progress, type RunParams, type VideoAnalysis } from "./schemas";

export type Competitor = typeof competitors.$inferSelect;
export type Run = typeof analyzerRuns.$inferSelect;
export type AnalyzedVideo = typeof analyzedVideos.$inferSelect;

const DAY_MS = 86_400_000;

/* ───────────── Competidores ───────────── */

/** Copia los referentes del alta a la lista de competidores (una sola vez por cuenta). */
export async function syncReferentes(userId: string): Promise<void> {
  const intake = await getIntake(userId);
  const names = (intake?.quick?.referentes ?? []).map(normalizeUsername).filter((n): n is string => Boolean(n));
  if (!names.length) return;
  await db()
    .insert(competitors)
    .values(names.map((username) => ({ userId, username, source: "referente" as const })))
    .onConflictDoNothing();
}

export async function listCompetitors(userId: string): Promise<Competitor[]> {
  await syncReferentes(userId);
  return db().select().from(competitors).where(eq(competitors.userId, userId)).orderBy(competitors.createdAt);
}

export async function addCompetitor(userId: string, input: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const username = normalizeUsername(input);
  if (!username) return { ok: false, error: "Escribe un usuario de Instagram válido (por ejemplo @cuenta)." };
  const current = await listCompetitors(userId);
  if (current.some((c) => c.username === username)) return { ok: false, error: "Esa cuenta ya está en tu lista." };
  if (current.length >= MAX_COMPETITORS) return { ok: false, error: `Máximo ${MAX_COMPETITORS} cuentas.` };
  await db().insert(competitors).values({ userId, username, source: "manual" }).onConflictDoNothing();
  return { ok: true };
}

export async function removeCompetitor(userId: string, id: string): Promise<void> {
  await db().delete(competitors).where(and(eq(competitors.id, id), eq(competitors.userId, userId)));
}

/* ───────────── Corridas ───────────── */

export async function latestRun(userId: string): Promise<Run | null> {
  const [r] = await db().select().from(analyzerRuns).where(eq(analyzerRuns.userId, userId)).orderBy(desc(analyzerRuns.createdAt)).limit(1);
  return r ?? null;
}
export async function getRun(userId: string, id: string): Promise<Run | null> {
  const [r] = await db().select().from(analyzerRuns).where(and(eq(analyzerRuns.id, id), eq(analyzerRuns.userId, userId))).limit(1);
  return r ?? null;
}
export async function listVideos(userId: string, runId?: string): Promise<AnalyzedVideo[]> {
  const where = runId ? and(eq(analyzedVideos.userId, userId), eq(analyzedVideos.runId, runId)) : eq(analyzedVideos.userId, userId);
  return db().select().from(analyzedVideos).where(where).orderBy(desc(analyzedVideos.starred), desc(analyzedVideos.views));
}
export const parseProgress = (raw: unknown): Progress => progressSchema.parse(raw ?? {});
export const parseAnalysis = (raw: unknown): VideoAnalysis | null => {
  const r = videoAnalysisSchema.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseConcepts = (raw: unknown): Concepts | null => {
  const r = conceptsSchema.safeParse(raw);
  return r.success ? r.data : null;
};

/** Cuándo se puede volver a correr: 7 días después de la última corrida que no falló. */
export async function nextAllowedAt(userId: string, now = new Date()): Promise<Date | null> {
  const [r] = await db()
    .select({ createdAt: analyzerRuns.createdAt })
    .from(analyzerRuns)
    .where(and(eq(analyzerRuns.userId, userId), ne(analyzerRuns.status, "error")))
    .orderBy(desc(analyzerRuns.createdAt))
    .limit(1);
  if (!r) return null;
  const interval = (await getLimits()).analyzerIntervalDays;
  const next = new Date(r.createdAt.getTime() + interval * DAY_MS);
  return next > now ? next : null;
}

export async function startRun(userId: string, rawParams: Partial<RunParams> = {}): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  const list = await listCompetitors(userId);
  if (!list.length) return { ok: false, error: "Agrega al menos una cuenta para estudiar." };
  // Una corrida que lleva horas “activa” se dio por perdida (el worker murió): se libera para no bloquear al creador.
  await db().update(analyzerRuns).set({ status: "error", error: "Se interrumpió. Intenta de nuevo.", finishedAt: new Date() }).where(and(eq(analyzerRuns.userId, userId), inArray(analyzerRuns.status, ["en_cola", "corriendo"]), lt(analyzerRuns.createdAt, new Date(Date.now() - 2 * 60 * 60 * 1000))));
  const active = await latestRun(userId);
  if (active && ["en_cola", "corriendo"].includes(active.status)) return { ok: false, error: "Ya hay un análisis en curso." };
  const limits = await getLimits();
  const wait = await nextAllowedAt(userId);
  if (wait) return { ok: false, error: `Puedes correr el análisis ${limits.analyzerIntervalDays === 7 ? "una vez por semana" : `una vez cada ${limits.analyzerIntervalDays} días`}. Vuelve a intentarlo el ${wait.toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" })}.` };
  const params = paramsSchema.parse({ ...DEFAULT_PARAMS, topK: limits.analyzerTopK, ...rawParams });
  const mock = !(apifyConfigured() && geminiConfigured());
  let run: { id: string } | undefined;
  try {
    [run] = await db()
      .insert(analyzerRuns)
      .values({ userId, params, mock, progress: { phase: "preparando", accountsTotal: list.length, accountsDone: 0, videosTotal: 0, videosDone: 0, errors: [], note: "" } })
      .returning({ id: analyzerRuns.id });
  } catch (e) {
    // Un índice único impide dos corridas activas a la vez (dos toques seguidos al botón).
    if ((e as { code?: string; cause?: { code?: string } }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505") return { ok: false, error: "Ya hay un análisis en curso." };
    throw e;
  }
  await enqueue("analizador.correr", userId, { runId: run!.id });
  return { ok: true, runId: run!.id };
}

export async function toggleStar(userId: string, videoId: string): Promise<void> {
  const [v] = await db().select({ starred: analyzedVideos.starred }).from(analyzedVideos).where(and(eq(analyzedVideos.id, videoId), eq(analyzedVideos.userId, userId))).limit(1);
  if (v) await db().update(analyzedVideos).set({ starred: !v.starred }).where(and(eq(analyzedVideos.id, videoId), eq(analyzedVideos.userId, userId)));
}

export async function thumbnailKey(userId: string, videoId: string): Promise<string | null> {
  const [v] = await db().select({ k: analyzedVideos.thumbnailKey }).from(analyzedVideos).where(and(eq(analyzedVideos.id, videoId), eq(analyzedVideos.userId, userId))).limit(1);
  return v?.k ?? null;
}

/* ───────────── Ejecución (corre en el worker) ───────────── */

const skillText = (dir: string) => readFile(path.join(process.cwd(), "skills", dir, "v1", "skill.md"), "utf8");

async function logCall(userId: string, skill: string, mock: boolean, status: "ok" | "error", tokens?: { i?: number; o?: number }) {
  await db()
    .insert(aiCalls)
    .values({ userId, skill, skillVersion: `${skill}-v1`, mock, status, costCents: 0, inputTokens: tokens?.i ?? null, outputTokens: tokens?.o ?? null })
    .catch(() => undefined);
}

async function setProgress(runId: string, p: Progress) {
  await db().update(analyzerRuns).set({ progress: p }).where(eq(analyzerRuns.id, runId));
}

/** Videos de ejemplo cuando faltan las llaves de Apify o Gemini (se marcan como ejemplo en pantalla). */
export function sampleReels(username: string): ScrapedReel[] {
  const day = new Date(Date.now() - 6 * DAY_MS).toISOString().slice(0, 10);
  return [{ videoUrl: "", postUrl: `https://www.instagram.com/${username}/`, views: 48_200, likes: 3_100, comments: 142, username, thumbnail: "", datePosted: day }];
}
export function sampleAnalysis(): VideoAnalysis {
  return {
    skill_version: "analizador-video-v1",
    concepto: "Ejemplo: un error común del nicho explicado en 30 segundos con una solución concreta.",
    gancho: { visual: "Primer plano hablando a cámara", texto: "“Deja de hacer esto”", audio: "Frase directa y una pregunta", por_que_funciona: "Señala un error que la gente reconoce en sí misma." },
    retencion: ["0:03 — promete una solución al final", "0:10 — cambio de plano para renovar la atención", "0:20 — ejemplo concreto antes del cierre"],
    recompensa: { tipo: "educacion", descripcion: "Una acción clara que se puede aplicar hoy." },
    guion: "1) Nombra el error. 2) Explica por qué cuesta. 3) Da la solución en un paso. 4) Invita a guardar.",
    formato: "Cabeza parlante con subtítulos",
  };
}
export function sampleConcepts(nicho: string): Concepts {
  const n = nicho || "tu tema";
  return {
    skill_version: "analizador-conceptos-v1",
    conceptos: [
      { titulo: "El error que todos cometen", gancho: `Si haces esto en ${n}, estás frenando tu avance.`, idea: "Nombra un error frecuente de tu nicho y da la solución en un paso.", guion_corto: "1) Error. 2) Por qué cuesta. 3) Solución. 4) Guarda este video.", por_que_encaja: "Usa la misma estructura que funcionó, con tu tema." },
      { titulo: "Antes y después", gancho: "Así se veía hace un mes y así se ve hoy.", idea: "Muestra un cambio real con una enseñanza.", guion_corto: "1) Antes. 2) Qué cambió. 3) Después. 4) Qué aprendí.", por_que_encaja: "Mezcla inspiración con una lección práctica." },
      { titulo: "Tres cosas que haría de nuevo", gancho: "Si empezara hoy, haría solo estas tres cosas.", idea: "Lista corta, ordenada por impacto.", guion_corto: "1) Gancho. 2) Tres puntos. 3) Cierre con pregunta.", por_que_encaja: "Formato de lista fácil de guardar y compartir." },
    ],
  };
}

async function brandContext(userId: string) {
  const manual = await getManual(userId).catch(() => null);
  const n = manual?.content.nicho;
  return { nicho: typeof n === "string" ? n : (n?.principal ?? ""), pilares: manual?.content.pilares.map((p) => p.nombre) ?? [], palabras_no: manual?.content.palabras_no ?? [], tono: manual?.content.tono ?? undefined };
}

async function saveThumbnail(userId: string, url: string): Promise<string | null> {
  if (!url || !storageConfigured()) return null;
  try {
    const { data } = await downloadLimited(url, MAX_THUMB_BYTES, 30_000);
    const jpg = await sharp(data).rotate().resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    const key = `analizador/${userId}/${randomUUID()}.jpg`;
    await putObjectStream(key, Readable.from(jpg), "image/jpeg");
    return key;
  } catch {
    return null;
  }
}

async function analyzeVideo(userId: string, reel: ScrapedReel): Promise<VideoAnalysis> {
  const { data, contentType } = await downloadLimited(reel.videoUrl, MAX_VIDEO_BYTES);
  const mime = contentType.startsWith("video/") ? contentType : "video/mp4";
  const file = await geminiUploadFile(data, mime); // el video no se guarda en nuestro almacenamiento
  const raw = await geminiGenerate([{ file }, { text: `${await skillText("analizador-video")}\n\nResponde solo con el JSON.` }], { json: true, timeoutMs: 180_000 });
  const analysis = videoAnalysisSchema.parse(parseJson(raw));
  await logCall(userId, "analizador-video", false, "ok");
  return analysis;
}

async function writeConcepts(userId: string, analysis: VideoAnalysis): Promise<Concepts> {
  const marca = await brandContext(userId);
  const r = await claudeText(await skillText("analizador-conceptos"), `Entrada:\n${JSON.stringify({ analisis: analysis, marca })}\n\nResponde solo con el JSON de salida.`, { maxTokens: 2500 });
  const concepts = conceptsSchema.parse(parseJson(r.text));
  await logCall(userId, "analizador-conceptos", false, "ok", { i: r.inputTokens, o: r.outputTokens });
  return concepts;
}

/** Corre un análisis completo. Es seguro repetirlo si el worker lo reintenta: borra lo que quedó a medias. */
export async function runAnalyzer(userId: string, runId: string): Promise<void> {
  const run = await getRun(userId, runId);
  if (!run || run.status === "lista") return;
  const params = paramsSchema.parse(run.params);
  const list = await listCompetitors(userId);
  const real = apifyConfigured() && geminiConfigured();
  const prog: Progress = { phase: "buscando", accountsTotal: list.length, accountsDone: 0, videosTotal: 0, videosDone: 0, errors: [], note: "" };

  const old = await db().select({ k: analyzedVideos.thumbnailKey }).from(analyzedVideos).where(eq(analyzedVideos.runId, runId));
  for (const o of old) if (o.k) await deleteObject(o.k).catch(() => undefined);
  await db().delete(analyzedVideos).where(eq(analyzedVideos.runId, runId));
  await db().update(analyzerRuns).set({ status: "corriendo", mock: !real, error: null, progress: prog }).where(eq(analyzerRuns.id, runId));

  try {
    const picked: { reel: ScrapedReel; comp: Competitor }[] = [];
    for (const comp of list) {
      try {
        const reels = real ? await scrapeReels(comp.username, params.maxVideos, params.nDays) : sampleReels(comp.username);
        picked.push(...reels.slice(0, params.topK).map((reel) => ({ reel, comp })));
        await db()
          .update(competitors)
          .set({ reels30d: reels.length, avgViews30d: reels.length ? Math.round(reels.reduce((s, r) => s + r.views, 0) / reels.length) : 0, lastScrapedAt: new Date() })
          .where(eq(competitors.id, comp.id));
        if (!reels.length) prog.errors.push(`@${comp.username}: sin reels recientes`);
      } catch (e) {
        prog.errors.push(`@${comp.username}: ${(e instanceof Error ? e.message : "falló").slice(0, 120)}`);
      }
      prog.accountsDone += 1;
      prog.videosTotal = picked.length;
      await setProgress(runId, prog);
    }

    prog.phase = "analizando";
    await setProgress(runId, prog);
    const marca = await brandContext(userId);
    let saved = 0;
    for (const { reel } of picked) {
      try {
        const analysis = real ? await analyzeVideo(userId, reel) : sampleAnalysis();
        let concepts: Concepts;
        if (real && claudeConfigured()) {
          try {
            concepts = await writeConcepts(userId, analysis);
          } catch (e) {
            await logCall(userId, "analizador-conceptos", false, "error");
            throw e;
          }
        } else concepts = sampleConcepts(marca.nicho);
        const thumbnailKey = real ? await saveThumbnail(userId, reel.thumbnail) : null;
        await db().insert(analyzedVideos).values({ runId, userId, creator: reel.username, link: reel.postUrl, thumbnailKey, views: reel.views, likes: reel.likes, comments: reel.comments, datePosted: reel.datePosted, analysis, concepts });
        saved += 1;
      } catch (e) {
        if (real) await logCall(userId, "analizador-video", false, "error");
        prog.errors.push(`@${reel.username}: ${(e instanceof Error ? e.message : "falló").slice(0, 120)}`);
      }
      prog.videosDone += 1;
      await setProgress(runId, prog);
    }

    prog.phase = "listo";
    if (saved === 0) throw new Error(prog.errors[0] ?? "No se pudo analizar ningún video");
    await db().update(analyzerRuns).set({ status: "lista", progress: prog, summary: { videos: saved, cuentas: list.length }, finishedAt: new Date() }).where(eq(analyzerRuns.id, runId));
    void sendToUser(userId, { title: "Tu análisis de la competencia está listo", body: `Revisamos ${saved} reel${saved === 1 ? "" : "s"} y te dejamos ideas nuevas para tu marca.`, url: "/analizador", tag: `analizador-${runId}` }).catch(() => undefined);
  } catch (err) {
    await db().update(analyzerRuns).set({ status: "error", progress: prog, error: (err instanceof Error ? err.message : "Falló el análisis").slice(0, 300), finishedAt: new Date() }).where(eq(analyzerRuns.id, runId));
    throw err;
  }
}
