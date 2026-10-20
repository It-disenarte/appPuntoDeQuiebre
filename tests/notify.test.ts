import { describe, expect, it } from "vitest";
import { dueNotifications, localParts, previousPeriod, type NotifyContext } from "@/lib/notify/rules";

// México es UTC-6 en octubre de 2026 (sin horario de verano). 2026-10-20 es martes.
const at = (isoLocal: string) => new Date(new Date(`${isoLocal}:00Z`).getTime() + 6 * 3_600_000);

const base: NotifyContext = {
  now: at("2026-10-20T10:00"),
  name: "Ana Huerta",
  accountCreatedAt: new Date("2026-10-15T00:00:00Z"),
  manualApproved: true,
  blocks: [
    { tipo: "fijo", dia: "M", inicio: "19:00", fin: "20:00" },
    { tipo: "fijo", dia: "J", inicio: "19:00", fin: "20:00" },
    { tipo: "respaldo", dia: "D", inicio: "10:00", fin: "12:00" },
  ],
  pieces: [],
  storyToday: null,
  metricPeriods: [],
  pausedUntil: null,
  enabled: true,
};
const kinds = (ctx: Partial<NotifyContext>) => dueNotifications({ ...base, ...ctx }).map((n) => n.kind);

describe("hora local del creador", () => {
  it("convierte a la zona de la Ciudad de México", () => {
    expect(localParts(new Date("2026-10-21T01:30:00Z"))).toEqual({ date: "2026-10-20", minutes: 19 * 60 + 30 });
    expect(previousPeriod("2026-01-01")).toBe("2025-12");
    expect(previousPeriod("2026-11-01")).toBe("2026-10");
  });
});

describe("avisos de grabación", () => {
  it("1 hora antes del bloque (martes 18:00)", () => {
    const n = dueNotifications({ ...base, now: at("2026-10-20T18:05") });
    expect(n.map((x) => x.kind)).toContain("grabar_1h");
    expect(n.find((x) => x.kind === "grabar_1h")!.refKey).toBe("2026-10-20");
  });
  it("no avisa antes de tiempo ni mucho después", () => {
    expect(kinds({ now: at("2026-10-20T16:30") })).not.toContain("grabar_1h");
    expect(kinds({ now: at("2026-10-20T19:30") })).not.toContain("grabar_1h");
  });
  it("la noche anterior a las 20:00 (lunes para el bloque del martes)", () => {
    const n = dueNotifications({ ...base, now: at("2026-10-19T20:10") });
    const x = n.find((y) => y.kind === "grabar_dia_antes")!;
    expect(x.body).toMatch(/Mañana grabas a las 19:00/);
    expect(x.refKey).toBe("2026-10-20");
  });
  it("si el día anterior también graba y el bloque cubre las 20:00, avisa al terminar", () => {
    const blocks = [
      { tipo: "fijo" as const, dia: "M", inicio: "19:00", fin: "20:30" },
      { tipo: "fijo" as const, dia: "X", inicio: "19:00", fin: "20:30" },
    ];
    expect(kinds({ blocks, now: at("2026-10-20T20:10") })).not.toContain("grabar_dia_antes"); // aún está grabando
    const n = dueNotifications({ ...base, blocks, now: at("2026-10-20T20:35") });
    expect(n.find((x) => x.kind === "grabar_dia_antes")!.title).toMatch(/Mañana repites/);
  });
  it("avisa del día extra la noche anterior", () => {
    expect(kinds({ now: at("2026-10-24T20:20") })).toContain("grabar_respaldo"); // sábado para el domingo
  });
});

describe("otros avisos", () => {
  it("la historia del día a las 9:00 si no la ha hecho", () => {
    const story = { id: "s1", done: false, tipo: "Encuesta" };
    expect(kinds({ now: at("2026-10-20T09:10"), storyToday: story })).toContain("historia_dia");
    expect(kinds({ now: at("2026-10-20T09:10"), storyToday: { ...story, done: true } })).not.toContain("historia_dia");
    expect(kinds({ now: at("2026-10-20T09:10"), storyToday: null })).not.toContain("historia_dia");
  });
  it("30 minutos antes de publicar, solo si sigue pendiente", () => {
    const piece = { id: "p1", day: "2026-10-20", publishTime: "18:00", topic: "Regar de más", kind: "video" as const, status: "pendiente" };
    expect(dueNotifications({ ...base, now: at("2026-10-20T17:35"), pieces: [piece] }).find((n) => n.kind === "publicar")?.refKey).toBe("p1");
    expect(kinds({ now: at("2026-10-20T17:35"), pieces: [{ ...piece, status: "publicado" }] })).not.toContain("publicar");
    expect(kinds({ now: at("2026-10-20T17:35"), pieces: [{ ...piece, day: "2026-10-21" }] })).not.toContain("publicar");
  });
  it("pide las métricas el día 1 de cada mes y no si ya las envió", () => {
    const n = dueNotifications({ ...base, now: at("2026-11-01T10:15") });
    const m = n.find((x) => x.kind === "metricas_mensual")!;
    expect(m.refKey).toBe("2026-10");
    expect(m.title).toMatch(/octubre/);
    expect(m.url).toBe("/progreso/metricas");
    expect(kinds({ now: at("2026-11-01T10:15"), metricPeriods: ["2026-10"] })).not.toContain("metricas_mensual");
    expect(kinds({ now: at("2026-11-02T10:15") })).not.toContain("metricas_mensual");
    expect(kinds({ now: at("2026-11-01T10:15"), metricsEligible: false })).not.toContain("metricas_mensual"); // aún no publicaba nada el mes pasado
  });
  it("un aviso amable si a los 10 días no termina la brújula", () => {
    const late = { accountCreatedAt: new Date("2026-10-08T00:00:00Z"), manualApproved: false, now: at("2026-10-20T11:05") };
    expect(kinds(late)).toContain("alta_atrasada");
    expect(kinds({ ...late, manualApproved: true })).not.toContain("alta_atrasada");
    expect(kinds({ ...late, accountCreatedAt: new Date("2026-10-18T00:00:00Z") })).not.toContain("alta_atrasada");
  });
});

describe("silencios", () => {
  it("el modo pausa silencia todo hasta su fecha", () => {
    expect(kinds({ now: at("2026-10-20T18:05"), pausedUntil: "2026-10-22" })).toEqual([]);
    expect(kinds({ now: at("2026-10-20T18:05"), pausedUntil: "2026-10-19" })).toContain("grabar_1h");
  });
  it("si desactivó los avisos no manda nada", () => {
    expect(kinds({ now: at("2026-10-20T18:05"), enabled: false })).toEqual([]);
  });
});
