import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.APIFY_TRENDS_ACTOR;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "tomas@correo.com", name: "Tomás", passwordHash: "x" }).returning();
  userId = u!.id;
}, 30_000);

describe("lista de tendencias", () => {
  it("lee varios formatos de actor, calcula el estado con el historial y solo acepta enlaces https", async () => {
    const { normalizeItems } = await import("@/lib/trends/list");
    const first = normalizeItems([{ hashtagName: "DatoCurioso", rank: 1, videoCount: 5000, videoUrl: "https://www.tiktok.com/@a/video/1" }, { musicTitle: "Canción X", rank: 2, musicUrl: "http://inseguro.com/a" }, { nada: true }], []);
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({ tipo: "hashtag", estado: "subiendo", dias_en_lista: 1, posicion: 1 });
    expect(first[0]!.link_ejemplo).toBe("https://www.tiktok.com/@a/video/1");
    expect(first[1]).toMatchObject({ tipo: "cancion" });
    expect(first[1]!.audio.link).toBeNull(); // http no se acepta
    // Al día siguiente: sube de posición → subiendo; cae mucho → bajando.
    const next = normalizeItems([{ musicTitle: "Canción X", rank: 9 }, { hashtagName: "DatoCurioso", rank: 1 }], first);
    expect(next.find((t) => t.tipo === "cancion")!.estado).toBe("bajando");
    expect(next.find((t) => t.tipo === "hashtag")!.dias_en_lista).toBe(2);
  });

  it("sin actor configurado guarda la lista de ejemplo", async () => {
    const { refreshTrends, latestList } = await import("@/lib/trends/list");
    const r = await refreshTrends("2026-10-20");
    expect(r.source).toBe("muestra");
    const l = (await latestList())!;
    expect(l.items.length).toBeGreaterThan(3);
    await refreshTrends("2026-10-20"); // idempotente por día
  }, 30_000);
});

describe("reglas por código sobre las ideas", () => {
  it("descarta lo que no está en la lista, lo que baja, lo usado y lo repetido; pone la fecha límite y copia los enlaces", async () => {
    const { shapeIdeas, trendSchema } = await import("@/lib/trends/schemas");
    const mk = (id: string, estado: "pico" | "subiendo" | "bajando", link: string | null = null) => trendSchema.parse({ id, tipo: "formato", nombre: id, estado, link_ejemplo: link, audio: { nombre: null, link: null } });
    const list = [mk("a", "pico", "https://tiktok.com/v/a"), mk("b", "subiendo"), mk("c", "bajando"), mk("d", "pico"), mk("e", "pico")];
    const idea = (tendencia_id: string) => ({ tendencia_id, idea: "x", urgencia: { estado: "pico" as const, texto: "", grabar_antes_de: "2030-01-01" }, video_ejemplo: "https://inventado.com/falso", audio: { nombre: null, nota: null, link: "https://inventado.com/audio" } });
    const out = { fecha: null, ideas: [idea("a"), idea("a"), idea("zzz"), idea("c"), idea("d"), idea("b"), idea("e")].map((i) => ({ tendencia_nombre: "", formato: "reel" as const, redes: [], pilar: "", cuando_grabar: "", por_que_te_sirve: "", gancho: "", guion: [], como_grabarla: "", siguiente_paso: "grabar" as const, ...i })), descartadas: [], aviso: null };
    const r = shapeIdeas(out, list, new Set(["d"]), new Set(), "2026-10-20");
    expect(r.ideas.map((i) => i.tendencia_id)).toEqual(["a", "b", "e"]); // sin repetidas, inventadas, bajando ni usadas; máximo 3
    expect(r.ideas[0]!.urgencia.grabar_antes_de).toBe("2026-10-22"); // pico: 48 horas
    expect(r.ideas[1]!.urgencia.grabar_antes_de).toBe("2026-10-24"); // subiendo: 4 días
    expect(r.ideas[0]!.video_ejemplo).toBe("https://tiktok.com/v/a"); // se copia de la lista, no de la IA
    expect(r.ideas[1]!.audio.link).toBeNull();
  });
});

describe("uso de tendencias (sin IA: ideas de ejemplo)", () => {
  it("entrega 3 ideas de tendencias distintas, sin las que bajan", async () => {
    const svc = await import("@/lib/trends/service");
    const r = await svc.requestUse(userId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const use = (await svc.listUses(userId))[0]!;
    const ideas = svc.parseRounds(use.rounds)[0]!.ideas;
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas.length).toBeLessThanOrEqual(3);
    expect(new Set(ideas.map((i) => i.tendencia_id)).size).toBe(ideas.length);
    expect(ideas.some((i) => i.tendencia_id === "m-5")).toBe(false); // “bajando”
    expect(ideas.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.urgencia.grabar_antes_de))).toBe(true);
  }, 30_000);

  it("respeta el límite semanal del plan (Básico: 3)", async () => {
    const svc = await import("@/lib/trends/service");
    expect((await svc.weeklyQuota(userId)).limit).toBe(3);
    await svc.markTrendUsed(userId, "m-1"); // las usadas no se repiten
    expect((await svc.requestUse(userId)).ok).toBe(true);
    expect((await svc.requestUse(userId)).ok).toBe(true);
    const fourth = await svc.requestUse(userId);
    expect(fourth.ok).toBe(false);
    expect(!fourth.ok && fourth.error).toMatch(/consultas de esta semana/);
  }, 30_000);

  it("los refresh no gastan una consulta, no pasan de 2 y luego queda el selector manual", async () => {
    const svc = await import("@/lib/trends/service");
    const use = (await svc.listUses(userId))[0]!;
    const before = (await svc.weeklyQuota(userId)).used;
    expect((await svc.refreshUse(userId, use.id, "")).ok).toBe(false);
    expect((await svc.refreshUse(userId, use.id, "muy parecidas")).ok).toBe(true);
    expect((await svc.refreshUse(userId, use.id, "quiero otras")).ok).toBe(true);
    expect((await svc.refreshUse(userId, use.id, "otra vez")).ok).toBe(false);
    expect((await svc.weeklyQuota(userId)).used).toBe(before);
    const options = await svc.selectableTrends(userId);
    expect(options.every((t) => t.estado !== "bajando" && t.id !== "m-1")).toBe(true);
    expect((await svc.chooseTrend(userId, use.id, "m-5")).ok).toBe(false); // bajando: no se puede elegir
    expect((await svc.chooseTrend(userId, use.id, options[0]!.id)).ok).toBe(true);
  }, 30_000);
});
