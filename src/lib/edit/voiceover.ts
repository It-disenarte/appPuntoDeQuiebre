import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq, sum } from "drizzle-orm";
import { claudeConfigured } from "@/lib/ai/claude";
import { geminiConfigured } from "@/lib/ai/gemini";
import { getManual, getVoiceProfile } from "@/lib/brujula/service";
import { db } from "@/lib/db";
import { contentPieces, looseClips, videoEdits, voiceovers } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs";
import { getPiece, parseScript } from "@/lib/plan/service";
import { sendToUser } from "@/lib/push";
import { probeVideo, runFfmpeg } from "@/lib/recording/ffmpeg";
import { visionJson } from "@/lib/skills";
import type { VideoGuion } from "@/lib/skills/schemas";
import { deleteObject, getObject, putObjectStream } from "@/lib/storage";
import { resolveKitFont, stageFonts } from "./fonts";
import { mockVoPlan, mockWords } from "./mock";
import { audioArgs, buildVoFilterScript, coverArgs, frameArgs, voEditArgs } from "./render-args";
import { listClips } from "./recipe";
import { EMPTY_OVERRIDES, normalizePlan, planSchema, type Plan, type Word } from "./schemas";
import { assKitOf, downloadTo, editQuota, getEdit, isStuck, logCall, parseOverrides, parsePlan, parseWords, applyDoubts, transcribeWords } from "./service";
import { buildAss, buildCoverAss, type AssStyleKit } from "./timeline";

type Result = { ok: true } | { ok: false; error: string };

export { VO_MAX_AUDIO_BYTES, VO_MAX_CLIP_SECONDS, VO_MAX_SECONDS, VO_MAX_TOTAL_BYTES } from "./vo-rules";

export type Voiceover = typeof voiceovers.$inferSelect;

export async function getVoiceover(userId: string, pieceId: string): Promise<Voiceover | null> {
  const [v] = await db().select().from(voiceovers).where(and(eq(voiceovers.userId, userId), eq(voiceovers.pieceId, pieceId))).limit(1);
  return v ?? null;
}

/** Guarda la voz en off de la pieza (reemplaza la anterior y borra su archivo). */
export async function commitVoiceover(v: { userId: string; pieceId: string; key: string; contentType: string; bytes: number; seconds: number }): Promise<Voiceover> {
  const old = await getVoiceover(v.userId, v.pieceId);
  const [row] = await db()
    .insert(voiceovers)
    .values({ userId: v.userId, pieceId: v.pieceId, objectKey: v.key, contentType: v.contentType, bytes: v.bytes, seconds: v.seconds })
    .onConflictDoUpdate({ target: voiceovers.pieceId, set: { objectKey: v.key, contentType: v.contentType, bytes: v.bytes, seconds: v.seconds, createdAt: new Date() } })
    .returning();
  if (old && old.objectKey !== v.key) await deleteObject(old.objectKey).catch(() => undefined);
  return row!;
}

export async function removeVoiceover(userId: string, pieceId: string): Promise<void> {
  const v = await getVoiceover(userId, pieceId);
  if (!v) return;
  await db().delete(voiceovers).where(eq(voiceovers.id, v.id));
  await deleteObject(v.objectKey).catch(() => undefined);
}

export async function openVoiceover(userId: string, pieceId: string, range?: string) {
  const v = await getVoiceover(userId, pieceId);
  return v ? getObject(v.objectKey, range) : null;
}

/** ¿Se puede subir otra toma? Máximo de tomas (lo revisa canAddClip) y 1 GB entre todas. */
export async function clipsBytes(pieceId: string): Promise<number> {
  const [row] = await db().select({ total: sum(looseClips.bytes) }).from(looseClips).where(eq(looseClips.pieceId, pieceId));
  return Number(row?.total ?? 0);
}

/* ───────────── Pedir la edición ───────────── */

export async function requestVoEdit(userId: string, pieceId: string): Promise<Result> {
  const q = await editQuota(userId);
  if (!q.allowed) return { ok: false, error: "La edición automática es del plan Pro." };
  const piece = await getPiece(userId, pieceId);
  if (!piece || piece.kind !== "video") return { ok: false, error: "Esa pieza no existe." };
  if ((await listClips(userId, pieceId)).length === 0) return { ok: false, error: "Sube al menos una toma." };
  if (!(await getVoiceover(userId, pieceId))) return { ok: false, error: "Primero graba o sube tu voz en off." };
  const cur = await getEdit(userId, pieceId);
  if (cur && !["error", "lista", "revision"].includes(cur.status) && !isStuck(cur)) return { ok: false, error: "Ya estamos trabajando en esta edición." };
  if (!cur && q.used >= q.limit) return { ok: false, error: `Ya usaste tus ${q.limit} ediciones de este mes. Se renuevan el día 1.` };
  if (cur) {
    await db().update(videoEdits).set({ mode: "voz_en_off", status: "planeando", plan: null, words: null, overrides: EMPTY_OVERRIDES, adjustments: 0, adjustNote: null, error: null }).where(eq(videoEdits.id, cur.id));
    await enqueue("edicion.planear", userId, { editId: cur.id });
    return { ok: true };
  }
  const [row] = await db().insert(videoEdits).values({ userId, pieceId, mode: "voz_en_off" }).returning({ id: videoEdits.id });
  await enqueue("edicion.planear", userId, { editId: row!.id });
  return { ok: true };
}

/* ───────────── Planear (worker) ───────────── */

const EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
const VOICE_EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/mpeg": "mp3" };

/** Instrucciones del modo nuevo; se agregan a la skill 13 (que ya fija subtítulos, textos, portada y reglas de marca). */
export const VO_INSTRUCTIONS = `
## MODO NUEVO: voz_en_off

El creador NO sale hablando a cámara: grabó una VOZ EN OFF aparte y subió varias TOMAS SUELTAS (clips). Tu trabajo es decidir qué toma se ve en cada momento de la voz. El video final dura lo mismo que la voz; el audio es solo la voz (el sonido de las tomas se descarta).

Entrada: \`voz.transcripcion.palabras\` (tiempos de la voz) y \`clips\` (id c1, c2…, \`numero\` 1, 2…, \`duracion_s\` y fotogramas en el orden de la lista).

Salida: el mismo JSON de los otros modos con \`"modo": "voz_en_off"\` y además:

\`\`\`
"tramos_voz": [
  { "clip": 1, "desde_s": 0.0, "hasta_s": 3.5, "inicio_s": 0.0, "fin_s": 3.5, "que_se_ve": "…", "frase": "lo que dice la voz en ese momento" }
]
\`\`\`

- \`inicio_s\`/\`fin_s\`: tiempos de la VOZ. Los tramos cubren toda la voz, en orden, sin huecos ni traslapes (el primero empieza en 0 y el último termina al final de la voz).
- \`clip\`: el \`numero\` de la toma. \`desde_s\`/\`hasta_s\`: el pedazo de esa toma (dentro de su duración).
- Elige la toma cuyo contenido va con lo que dice la voz en ese momento; si ninguna encaja, la más neutra y bonita. Usa todas las tomas que valgan la pena y no repitas la misma dos veces seguidas.
- Cada tramo dura entre 1.5 y 6 segundos; cambia de toma con el ritmo de la voz (en cada frase o idea nueva). Si un pedazo de toma dura menos que el tramo, el video repite su último cuadro: mejor reparte con otra toma.
- Nunca recortes ni acomodes la voz: no hay \`cortes\`, \`zooms\` ni \`encuadres\` en este modo (déjalos vacíos).
- \`subtitulos\`, \`textos_pantalla\` (gancho al inicio y llamada a la acción al final), \`portada\`, \`sugerencia_audio\`, \`resumen\` (3 a 4 puntos, en lenguaje sencillo), \`botones\` y \`dudas_transcripcion\` siguen las reglas de siempre, con tiempos de la voz. No uses el campo \`tramo\` en los subtítulos ni en los textos.
- El \`resumen\` debe decir qué hiciste con las tomas (por ejemplo, "Usé 6 de tus 8 tomas" o "Puse tu toma del café cuando hablas de la mañana").
`;

/** Planea la edición de voz en off: voz → palabras con tiempos; tomas → fotogramas; plan con Claude. Corre en el worker. */
export async function runVoPlan(userId: string, editId: string): Promise<void> {
  const [e] = await db().select().from(videoEdits).where(and(eq(videoEdits.id, editId), eq(videoEdits.userId, userId))).limit(1);
  if (!e) return;
  const piece = await getPiece(userId, e.pieceId);
  const parsed = piece ? parseScript("video", piece.script) : null;
  if (!piece || !parsed || !("cuerpo" in parsed)) throw new Error("La pieza ya no existe");
  const script = parsed as VideoGuion;
  const vo = await getVoiceover(userId, e.pieceId);
  if (!vo) throw new Error("No hay voz en off");
  const clips = await listClips(userId, e.pieceId);
  if (clips.length === 0) throw new Error("No hay tomas");
  await db().update(videoEdits).set({ status: "planeando", error: null }).where(eq(videoEdits.id, editId));

  const dir = await mkdtemp(path.join(tmpdir(), "pdq-vo-"));
  try {
    const voiceFile = path.join(dir, `voz.${VOICE_EXT[vo.contentType] ?? "m4a"}`);
    await downloadTo(vo.objectKey, voiceFile);
    const duration = (await probeVideo(voiceFile)).duration || vo.seconds;

    // Palabras con tiempos (se reutilizan si es un ajuste).
    let words: Word[] = parseWords(e.words);
    let mock = false;
    if (words.length === 0) {
      if (geminiConfigured()) {
        const mp3 = path.join(dir, "voz.mp3");
        await runFfmpeg(audioArgs(voiceFile, mp3));
        const manual = await getManual(userId).catch(() => null);
        words = await transcribeWords(await readFile(mp3), manual?.content.frase_de_marca ? `Punto de Quiebre; frase de marca: ${manual.content.frase_de_marca}` : "Punto de Quiebre");
        await logCall(userId, "edicion-transcripcion", false, "ok");
      } else {
        words = mockWords([script.gancho, ...script.cuerpo, script.cierre].join(" "), duration);
        mock = true;
      }
    }

    // Tomas: duración real y fotogramas para que la IA las vea.
    const clipSeconds: number[] = [];
    const images: Buffer[] = [];
    const framesPer: { segundo: number }[][] = [];
    for (const [i, c] of clips.entries()) {
      const file = path.join(dir, `c${i + 1}.${EXT[c.contentType] ?? "mp4"}`);
      await downloadTo(c.objectKey, file);
      const len = (await probeVideo(file)).duration || c.seconds;
      clipSeconds.push(len);
      if (claudeConfigured()) {
        const every = Math.max(1, Math.ceil(len / 3));
        const pattern = path.join(dir, `f${i + 1}-%02d.jpg`);
        await runFfmpeg(frameArgs(file, pattern, every, 3));
        const files = (await readdir(dir)).filter((n) => n.startsWith(`f${i + 1}-`) && n.endsWith(".jpg")).sort();
        framesPer.push(files.map((_, k) => ({ segundo: k * every })));
        for (const f of files) images.push(await readFile(path.join(dir, f)));
      }
    }

    const ak = await assKitOf(userId);
    const [manual, voice] = await Promise.all([getManual(userId).catch(() => null), getVoiceProfile(userId).catch(() => null)]);
    const previous = e.adjustments > 0 ? parsePlan(e.plan) : null;
    const ctx = { hook: script.gancho, cta: script.cierre, topic: piece.topic, perLine: ak.perLine, highlight: manual?.content.palabras_si?.[0] };
    let raw: Plan;
    if (claudeConfigured()) {
      const skillText = await readFile(path.join(process.cwd(), "skills", "edicion", "v1", "skill.md"), "utf8");
      const input = {
        creador_id: userId,
        plan: "pro",
        modo: "voz_en_off",
        video: { duracion_s: duration, red_destino: ["instagram"], formato: "reel" },
        voz: { duracion_s: Math.round(duration * 10) / 10, transcripcion: { palabras: words } },
        pieza: { pilar: piece.pillar, tema: piece.topic, guion: { gancho: script.gancho, desarrollo: script.cuerpo.join(" "), cierre_cta: script.cierre } },
        clips: clips.map((_, i) => ({ id: `c${i + 1}`, numero: i + 1, duracion_s: Math.round(clipSeconds[i]! * 10) / 10, fotogramas: (framesPer[i] ?? []).map((f) => ({ segundo: f.segundo, url: "imagen adjunta, en orden" })) })),
        kit_visual: ak.raw ?? {},
        brujula: { tono: manual?.content.tono ?? null, palabras_si: manual?.content.palabras_si ?? [] },
        perfil_voz: { muletillas_propias: (voice?.content.muletillas ?? []).map((m) => m.texto) },
        ajuste: { numero: e.adjustments, anterior: previous, nota: e.adjustNote },
      };
      const resp = await visionJson(`${skillText}\n${VO_INSTRUCTIONS}`, `Entrada:\n${JSON.stringify(input)}\n\nLas imágenes son los fotogramas de las tomas, en el orden de la lista (c1, c2, …). Responde solo con el JSON de salida del modo voz_en_off.`, images, "edicion-voz-en-off");
      raw = { ...planSchema.parse(resp.json), modo: "voz_en_off" };
      await logCall(userId, "edicion-voz-en-off", false, "ok", { i: resp.inputTokens, o: resp.outputTokens });
    } else {
      raw = mockVoPlan(words, duration, clipSeconds, ctx);
      mock = true;
    }
    const plan = normalizePlan(raw, duration, clipSeconds);
    if (plan.tramos_voz.length === 0) throw new Error("No se pudieron acomodar las tomas sobre la voz");
    await db()
      .update(videoEdits)
      .set({ status: "revision", plan, words: { palabras: words }, duration: Math.round(duration), overrides: e.adjustments > 0 ? { ...EMPTY_OVERRIDES } : parseOverrides(e.overrides), mock, error: null })
      .where(eq(videoEdits.id, editId));
  } catch (err) {
    await db().update(videoEdits).set({ status: "error", error: (err instanceof Error ? err.message : "No se pudo planear la edición").slice(0, 300) }).where(eq(videoEdits.id, editId));
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/* ───────────── Armar el video (worker) ───────────── */

export async function runVoRender(userId: string, editId: string): Promise<void> {
  const [e] = await db().select().from(videoEdits).where(and(eq(videoEdits.id, editId), eq(videoEdits.userId, userId))).limit(1);
  const plan0 = e && parsePlan(e.plan);
  if (!e || !plan0) return;
  const vo = await getVoiceover(userId, e.pieceId);
  if (!vo) throw new Error("No hay voz en off");
  const clips = await listClips(userId, e.pieceId);
  if (clips.length === 0) throw new Error("No hay tomas");
  await db().update(videoEdits).set({ status: "renderizando", error: null }).where(eq(videoEdits.id, editId));

  const dir = await mkdtemp(path.join(tmpdir(), "pdq-vorender-"));
  try {
    const o = parseOverrides(e.overrides);
    const plan = applyDoubts(plan0, o);
    const voiceFile = path.join(dir, `voz.${VOICE_EXT[vo.contentType] ?? "m4a"}`);
    await downloadTo(vo.objectKey, voiceFile);
    const duration = (await probeVideo(voiceFile)).duration || e.duration || vo.seconds;
    const clipFiles: string[] = [];
    for (const [i, c] of clips.entries()) {
      const file = path.join(dir, `c${i + 1}.${EXT[c.contentType] ?? "mp4"}`);
      await downloadTo(c.objectKey, file);
      clipFiles.push(file);
    }
    // Si se quitó una toma después de planear, los tramos que la usaban pasan a la primera para que no falle el render.
    const tramos = plan.tramos_voz.map((t) => (t.clip >= 1 && t.clip <= clipFiles.length ? t : { ...t, clip: 1 }));

    const ak = await assKitOf(userId);
    const [tf, xf] = await Promise.all([resolveKitFont(ak.kit.titleFont, "titulo"), resolveKitFont(ak.kit.textFont, "texto")]);
    const fontsDir = path.join(dir, "fonts");
    await mkdir(fontsDir);
    await stageFonts(fontsDir, [tf, xf]);
    const kit: AssStyleKit = { ...ak.kit, titleFont: tf.fullName, textFont: xf.fullName };

    const segs = [{ a: 0, b: duration, offset: 0 }];
    const assPath = path.join(dir, "edicion.ass");
    await writeFile(assPath, buildAss({ plan, overrides: o, segs, kit }));
    const out = path.join(dir, "editado.mp4");
    await runFfmpeg(voEditArgs(clipFiles, voiceFile, buildVoFilterScript({ tramos, assPath, fontsDir }), out), 20 * 60 * 1000);

    let coverKey: string | null = null;
    if (plan.portada?.titulo) {
      const coverAss = path.join(dir, "portada.ass");
      await writeFile(coverAss, buildCoverAss(plan.portada.titulo, plan.portada.resaltar, kit));
      const cover = path.join(dir, "portada.png");
      await runFfmpeg(coverArgs(out, Math.min(plan.portada.segundo, Math.max(0, duration - 0.5)), coverAss, fontsDir, cover));
      coverKey = `ediciones/${userId}/${e.pieceId}/portada-${randomUUID()}.png`;
      await putObjectStream(coverKey, createReadStream(cover), "image/png");
    }
    const outKey = `ediciones/${userId}/${e.pieceId}/${randomUUID()}.mp4`;
    await putObjectStream(outKey, createReadStream(out), "video/mp4");
    for (const k of [e.outputKey, e.coverKey]) if (k) await deleteObject(k).catch(() => undefined);
    await db().update(videoEdits).set({ status: "lista", outputKey: outKey, coverKey, outputSeconds: Math.round(duration), error: null }).where(eq(videoEdits.id, editId));
    // Un video de voz en off también cuenta como grabado (racha y estado de la pieza).
    await db().update(contentPieces).set({ status: "grabado" }).where(and(eq(contentPieces.id, e.pieceId), eq(contentPieces.status, "pendiente")));
    void sendToUser(userId, { title: "Tu video editado está listo", body: "Ya puedes verlo y descargarlo.", url: `/grabar?pieza=${e.pieceId}&modo=vozenoff`, tag: `edicion-${e.pieceId}` }).catch(() => undefined);
  } catch (err) {
    await db().update(videoEdits).set({ status: "error", error: (err instanceof Error ? err.message : "No se pudo armar el video").slice(0, 300) }).where(eq(videoEdits.id, editId));
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
