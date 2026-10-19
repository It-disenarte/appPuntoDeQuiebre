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
const WEEK = "2026-10-19"; // lunes

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.ANTHROPIC_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "nina@correo.com", name: "Nina", passwordHash: "x" }).returning();
  userId = u!.id;
}, 30_000);

describe("reglas de la semana de directos", () => {
  const live = (dia: string, tipo: "ancla" | "libre") => ({ dia, plataforma: "tiktok", tipo, titulo: `T ${dia}`, pilar: "", objetivo: "conectar" as const, apertura: "", puntos_para_hablar: [], preguntas_para_el_publico: [], dinamica: null, si_llega_hate: "", cierre: "", clip_para_reel: "", momento_clip: null });
  it("máximo 3 con guion, el resto libres y solo en los días elegidos", async () => {
    const { shapeWeek } = await import("@/lib/lives/schemas");
    const { getPlanDays } = await import("@/lib/lives/week");
    const days = getPlanDays(WEEK);
    const out = { lives_sugeridos: 5, lives: [live("2026-10-19", "ancla"), live("2026-10-20", "ancla"), live("2026-10-21", "ancla"), live("2026-10-22", "ancla"), live("2026-10-25", "ancla")], comodines: [] };
    const r = shapeWeek(out, { weekDays: days, selectedDays: ["lunes", "martes", "miércoles", "jueves"], platform: "tiktok", beginner: false });
    expect(r.lives.map((l) => l.dia)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]); // el domingo no estaba elegido
    expect(r.lives.filter((l) => l.tipo === "ancla")).toHaveLength(3);
    expect(r.lives[3]!.tipo).toBe("libre");
    expect(r.lives[3]!.puntos_para_hablar).toEqual([]);
  });
  it("quien quiere empezar hace 1 por semana y con guion", async () => {
    const { shapeWeek } = await import("@/lib/lives/schemas");
    const { getPlanDays } = await import("@/lib/lives/week");
    const out = { lives_sugeridos: 2, lives: [live("2026-10-22", "libre"), live("2026-10-24", "ancla")], comodines: [] };
    const r = shapeWeek(out, { weekDays: getPlanDays(WEEK), selectedDays: ["jueves", "sábado"], platform: "tiktok", beginner: true });
    expect(r.lives).toHaveLength(1);
    expect(r.lives[0]!.tipo).toBe("ancla");
  });
});

describe("guía de directos (sin IA: respuestas de ejemplo)", () => {
  it("exige datos según lo que responda", async () => {
    const svc = await import("@/lib/lives/service");
    expect((await svc.saveAnswers(userId, { situacion: "hace", plataformas: [], dias: [] })).ok).toBe(false);
    expect((await svc.saveAnswers(userId, { situacion: "quiere_hacer", plataformas: ["tiktok"], dias: ["jueves"] })).ok).toBe(false); // falta el compromiso
    expect((await svc.generateWeek(userId, WEEK)).ok).toBe(false); // todavía no respondió
  }, 30_000);

  it("quien hace directos recibe su guía con máximo 3 con guion", async () => {
    const svc = await import("@/lib/lives/service");
    expect((await svc.saveAnswers(userId, { situacion: "hace", plataformas: ["tiktok"], dias: ["lunes", "martes", "miércoles", "jueves", "viernes"], hora: "20:00" })).ok).toBe(true);
    expect((await svc.generateWeek(userId, WEEK)).ok).toBe(true);
    const g = svc.parseGuide((await svc.getWeekGuide(userId, WEEK))!.result)!;
    expect(g.lives).toHaveLength(5);
    expect(g.lives.filter((l) => l.tipo === "ancla").length).toBeLessThanOrEqual(3);
    await svc.generateWeek(userId, WEEK); // rehacer reemplaza, no duplica
    const rows = await pdb.select().from(schema.liveGuides);
    expect(rows.filter((r) => r.kind === "semanal")).toHaveLength(1);
  }, 30_000);

  it("marca directos hechos", async () => {
    const svc = await import("@/lib/lives/service");
    const g = (await svc.getWeekGuide(userId, WEEK))!;
    await svc.markDone(userId, g.id, "2026-10-19");
    expect(svc.parseDone((await svc.getWeekGuide(userId, WEEK))!.done)["2026-10-19"]).toBe(true);
    await svc.markDone(userId, g.id, "no-es-fecha");
    expect(Object.keys(svc.parseDone((await svc.getWeekGuide(userId, WEEK))!.done))).toEqual(["2026-10-19"]);
  }, 30_000);

  it("quien no quiere recibe recomendación, apoyo bajo demanda y el aviso se apaga tras 3 “ahora no”", async () => {
    const svc = await import("@/lib/lives/service");
    expect((await svc.saveAnswers(userId, { situacion: "no_quiere" })).ok).toBe(true);
    const p = (await svc.getLiveProfile(userId))!;
    expect(svc.parseRecommendation(p.recomendacion)?.plataforma_sugerida).toBeTruthy();
    expect((await svc.generateWeek(userId, WEEK)).ok).toBe(false); // no se le genera guía semanal
    await svc.requestSupport(userId, "Mi primer directo");
    expect(await svc.listSupport(userId)).toHaveLength(1);
    expect(svc.showMonthlyNotice(await svc.getLiveProfile(userId))).toBe(true);
    for (let i = 0; i < 3; i++) await svc.dismissNotice(userId);
    expect(svc.showMonthlyNotice(await svc.getLiveProfile(userId))).toBe(false);
    await svc.resetNotice(userId);
    expect(svc.showMonthlyNotice(await svc.getLiveProfile(userId))).toBe(true);
  }, 30_000);
});
