import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountAudits } from "@/lib/db/schema";
import { getConnection, listMedia, profileOf } from "@/lib/instagram/service";
import { getProfile as getProfileOpt, parseCurrent } from "@/lib/profile/service";
import { runAuditoria } from "@/lib/skills";
import { auditOutput, cardVoteSchema, MIN_POSTS, shapeAudit, type AuditOut, type CardVote } from "./schemas";

type Result = { ok: true } | { ok: false; error: string };
export type AuditRow = typeof accountAudits.$inferSelect;

export async function getAudit(userId: string): Promise<AuditRow | null> {
  const [r] = await db().select().from(accountAudits).where(eq(accountAudits.userId, userId)).limit(1);
  return r ?? null;
}
export const parseAudit = (raw: unknown): AuditOut | null => {
  const r = auditOutput.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseVotes = (raw: unknown): Record<string, CardVote> => (raw && typeof raw === "object" ? (raw as Record<string, CardVote>) : {});

const typeOf = (t: string) => (t === "VIDEO" ? "reel" : t === "CAROUSEL_ALBUM" ? "carrusel" : "imagen");
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Respuesta de PRUEBA (sin IA) para ver el flujo: tarjetas generales a partir de los números reales. */
function mockAudit(posts: number, reels: number, followers: number, best: string): AuditOut {
  return {
    skill_version: "auditoria-v1",
    modo: "completo",
    numeros_clave: { publicaciones_analizadas: posts, formato_que_mas_alcanza: reels * 2 > posts ? "reels" : "publicaciones", pct_alcance_no_seguidores: 0, mejor_hora: "" },
    temas_detectados: [],
    dices_vs_publicas: null,
    tono_detectado: null,
    visual_detectado: null,
    top_publicaciones: best ? [{ id: best, tema: "", por_que_funciono: "Es la que más interacción tuvo en tus últimas publicaciones." }] : [],
    tarjetas: [
      { id: "t1", tipo: "habito", texto: `Publicas sobre todo ${reels * 2 > posts ? "reels" : "fotos y carruseles"}` },
      { id: "t2", tipo: "publico", texto: followers >= 1000 ? "Ya tienes una comunidad que te sigue" : "Estás construyendo tu comunidad desde cero" },
      { id: "t3", tipo: "tema", texto: "Tus publicaciones más fuertes se parecen entre sí" },
      { id: "t4", tipo: "tono", texto: "Tu forma de escribir se siente cercana" },
      { id: "t5", tipo: "visual", texto: "Tu feed puede verse más consistente" },
    ],
    preguntas_pendientes: ["¿A quién quieres ayudar con tu contenido?", "¿Tienes o quieres vender algo?", "¿Por qué empezaste a crear contenido?"],
    para_reglas: { videos_validos: reels, usa_datos_propios: false, ganchos_que_funcionaron: [] },
  };
}

/** Corre la auditoría con los datos de la cuenta conectada. Con menos de 9 publicaciones no gasta IA (modo sin contenido). */
export async function runAudit(userId: string): Promise<Result> {
  const conn = await getConnection(userId);
  if (!conn) return { ok: false, error: "Primero conecta tu Instagram." };
  const media = await listMedia(userId, 20);
  const profile = profileOf(conn);
  const opt = await getProfileOpt(userId).then((r) => (r ? parseCurrent(r.current) : null)).catch(() => null);
  const m = (x: unknown) => (x && typeof x === "object" ? (x as Record<string, number>) : {});
  const posts = media.map((p) => ({ id: p.igMediaId, tipo: typeOf(p.mediaType), fecha: day(p.postedAt), texto: (p.caption ?? "").slice(0, 300), miniatura_url: "", visualizaciones: m(p.metrics).views ?? 0, me_gusta: m(p.metrics).likes ?? 0, comentarios: m(p.metrics).comments ?? 0, guardados: m(p.metrics).saved ?? 0, compartidos: m(p.metrics).shares ?? 0 }));
  const reels = posts.filter((p) => p.tipo === "reel").length;
  const since = Date.now() - 30 * 86_400_000;
  const recent = media.filter((p) => (p.postedAt?.getTime() ?? 0) >= since);
  const input = {
    creador_id: userId,
    perfil: { usuario: conn.username, nombre: conn.name ?? "", biografia: opt?.biografia ?? "", enlace: opt?.enlace ?? null, seguidores: profile.followers, seguidos: profile.follows, publicaciones: profile.mediaCount },
    publicaciones: posts,
    cuenta_30_dias: { visualizaciones: recent.reduce((s, p) => s + (m(p.metrics).views ?? 0), 0), interacciones: recent.reduce((s, p) => s + (m(p.metrics).likes ?? 0) + (m(p.metrics).comments ?? 0), 0), cuentas_alcanzadas: recent.reduce((s, p) => s + (m(p.metrics).reach ?? 0), 0) },
    audiencia: {},
  };
  const best = [...posts].sort((a, b) => b.me_gusta + b.comentarios + b.guardados - (a.me_gusta + a.comentarios + a.guardados))[0]?.id ?? "";

  let out: AuditOut;
  let mock = false;
  if (posts.length < MIN_POSTS) {
    out = shapeAudit({ ...mockAudit(posts.length, reels, profile.followers, best), modo: "sin_contenido" }, posts.length, reels);
    out = { ...out, preguntas_pendientes: ["¿A quién quieres ayudar con tu contenido?", "¿Tienes o quieres vender algo?", "¿Por qué empezaste a crear contenido?"] };
    mock = true; // no se llamó a la IA
  } else {
    const r = await runAuditoria(userId, input, auditOutput, () => mockAudit(posts.length, reels, profile.followers, best));
    out = shapeAudit(r.output, posts.length, reels);
    mock = r.mock;
  }
  await db().insert(accountAudits).values({ userId, result: out, mock }).onConflictDoUpdate({ target: accountAudits.userId, set: { result: out, votes: {}, mock } });
  return { ok: true };
}

export async function voteCard(userId: string, cardId: string, raw: unknown): Promise<Result> {
  const v = cardVoteSchema.safeParse(raw);
  const row = await getAudit(userId);
  const out = row && parseAudit(row.result);
  if (!v.success || !row || !out || !out.tarjetas.some((t) => t.id === cardId)) return { ok: false, error: "No se pudo guardar tu respuesta." };
  await db().update(accountAudits).set({ votes: { ...parseVotes(row.votes), [cardId]: v.data } }).where(eq(accountAudits.userId, userId));
  return { ok: true };
}
