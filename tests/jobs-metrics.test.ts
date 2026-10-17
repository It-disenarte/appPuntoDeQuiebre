import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

// Se sustituye la conexión real por una base PGlite con todas las migraciones.
const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "ana@correo.com", name: "Ana Ruiz", passwordHash: "x" }).returning();
  userId = u!.id;
});

describe("cola de trabajos", () => {
  it("encola, toma y completa un trabajo", async () => {
    const { enqueue, claimNext, completeJob } = await import("@/lib/jobs");
    const id = await enqueue("metricas.leer", userId, { period: "2026-10" });
    const job = await claimNext(["metricas.leer"]);
    expect(job?.id).toBe(id);
    expect(job?.attempts).toBe(1);
    expect(await claimNext(["metricas.leer"])).toBeNull(); // ya está corriendo
    await completeJob(id);
    const [row] = await pdb.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    expect(row!.status).toBe("lista");
  });
  it("solo toma los tipos que se piden", async () => {
    const { enqueue, claimNext } = await import("@/lib/jobs");
    await enqueue("analizador.correr", userId, {});
    expect(await claimNext(["metricas.leer"])).toBeNull();
    expect((await claimNext(["analizador.correr"]))?.kind).toBe("analizador.correr");
  });
  it("reintenta con espera y se rinde al agotar los intentos", async () => {
    const { enqueue, claimNext, failJob } = await import("@/lib/jobs");
    const id = await enqueue("metricas.leer", userId, { period: "2026-09" });
    const a = await claimNext(["metricas.leer"]);
    await failJob(a!.id, "falló la red");
    let [row] = await pdb.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    expect(row!.status).toBe("pendiente");
    expect(row!.runAfter.getTime()).toBeGreaterThan(Date.now()); // espera antes de reintentar
    await pdb.update(schema.jobs).set({ runAfter: new Date(Date.now() - 1000) }).where(eq(schema.jobs.id, id));
    const b = await claimNext(["metricas.leer"]);
    expect(b?.attempts).toBe(2);
    await failJob(b!.id, "falló otra vez");
    [row] = await pdb.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    expect(row!.status).toBe("error");
    expect(row!.error).toMatch(/falló otra vez/);
  });
  it("recupera un trabajo perdido (el worker murió)", async () => {
    const { enqueue, claimNext, STALE_MS } = await import("@/lib/jobs");
    const id = await enqueue("analizador.correr", userId, {});
    await pdb.update(schema.jobs).set({ status: "corriendo", lockedAt: new Date(Date.now() - STALE_MS - 1000), attempts: 1 }).where(eq(schema.jobs.id, id));
    const j = await claimNext(["analizador.correr"]);
    expect(j?.id).toBe(id);
    expect(j?.attempts).toBe(2);
  });
});

describe("notificaciones", () => {
  it("no permite guardar dos veces el mismo aviso", async () => {
    const v = { userId, kind: "grabar_1h", refKey: "2026-10-20", title: "t", body: "b", url: "/hoy" };
    const first = await pdb.insert(schema.notifications).values(v).onConflictDoNothing().returning();
    const second = await pdb.insert(schema.notifications).values(v).onConflictDoNothing().returning();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });
  it("solo acepta servicios de notificaciones conocidos", async () => {
    const { isPushEndpoint } = await import("@/lib/push");
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isPushEndpoint("https://wns2-par02p.notify.windows.com/?token=x")).toBe(true);
    expect(isPushEndpoint("http://fcm.googleapis.com/x")).toBe(false); // sin https
    expect(isPushEndpoint("https://localhost/x")).toBe(false);
    expect(isPushEndpoint("https://10.0.0.5/x")).toBe(false);
    expect(isPushEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com.evil.com/x")).toBe(false);
    expect(isPushEndpoint("https://evil.com/?fcm.googleapis.com")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
  });
  it("guarda y reemplaza suscripciones por endpoint", async () => {
    const { saveSubscription, countSubscriptions, removeSubscription } = await import("@/lib/push");
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/xyz", keys: { p256dh: "p".repeat(40), auth: "a".repeat(12) } };
    await saveSubscription(userId, sub, "Mozilla");
    await saveSubscription(userId, sub, "Mozilla"); // no duplica
    expect(await countSubscriptions(userId)).toBe(1);
    await removeSubscription(userId, sub.endpoint);
    expect(await countSubscriptions(userId)).toBe(0);
  });
  it("sin llaves VAPID no envía nada", async () => {
    const { sendToUser } = await import("@/lib/push");
    expect(await sendToUser(userId, { title: "x", body: "y", url: "/hoy" })).toEqual({ sent: 0, failed: 0 });
  });
});

describe("modo pausa", () => {
  it("limita a 7 días y se puede terminar", async () => {
    const { startPause, endPause, getSettings, isPaused } = await import("@/lib/notify/service");
    const until = await startPause(userId, 30, "2026-10-20");
    expect(until).toBe("2026-10-27");
    expect(isPaused((await getSettings(userId))!.pauseUntil, "2026-10-22")).toBe(true);
    expect(isPaused("2026-10-27", "2026-10-28")).toBe(false);
    await endPause(userId);
    expect((await getSettings(userId))!.pauseUntil).toBeNull();
  }, 30_000);
});

describe("informe de métricas (sin IA: datos de ejemplo)", () => {
  it("lee, pide confirmar, explica y compara contra el mes anterior", async () => {
    const svc = await import("@/lib/metrics/service");
    // Mes anterior ya confirmado.
    await pdb.insert(schema.metricReports).values({ userId, period: "2026-08", status: "lista", confirmed: { periodo: "2026-08", cuenta: { vistas: 1000, seguidores_total: 500 }, edited: [] }, explanation: { resumen: "x", indicadores: [{ id: "vistas", etiqueta: "Vistas", valor: "1000", cambio_pct: null, tono: "nuevo", explicacion: "" }] } });
    await pdb.insert(schema.metricReports).values({ userId, period: "2026-09", status: "procesando", shots: 1, shotKeys: [] });
    await svc.runExtraction(userId, "2026-09");
    let r = (await svc.getReport(userId, "2026-09"))!;
    expect(r.status).toBe("revision");
    expect(r.mock).toBe(true);
    expect(svc.parseExtracted(r.extracted)?.cuenta.vistas).toBeGreaterThan(0);

    expect((await svc.confirmReport(userId, "2026-09", { vistas: 2000, pct_vistas_no_seguidores: 150 })).ok).toBe(false); // porcentaje inválido
    const ok = await svc.confirmReport(userId, "2026-09", { vistas: 2000, seguidores_total: 550, alcance: null });
    expect(ok.ok).toBe(true);
    r = (await svc.getReport(userId, "2026-09"))!;
    expect(r.status).toBe("lista");
    const c = svc.parseConfirmed(r.confirmed)!;
    expect(c.cuenta.vistas).toBe(2000);
    expect(c.edited).toContain("vistas");
    const e = svc.parseExplanation(r.explanation)!;
    const vistas = e.indicadores.find((i) => i.id === "vistas")!;
    expect(vistas.cambio_pct).toBe(100); // 1000 → 2000
    expect(vistas.tono).toBe("sube");
    expect(e.hallazgos.every((h) => h.tipo === "hipotesis")).toBe(true); // 0 videos publicados
    expect(e.siguiente_paso).toBeTruthy();
  });
  it("no deja confirmar un informe que no está en revisión", async () => {
    const svc = await import("@/lib/metrics/service");
    expect((await svc.confirmReport(userId, "2026-09", { vistas: 5 })).ok).toBe(false);
  });
});
