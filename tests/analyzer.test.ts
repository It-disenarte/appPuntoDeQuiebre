import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.APIFY_TOKEN;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "luz@correo.com", name: "Luz", passwordHash: "x" }).returning();
  userId = u!.id;
});
afterEach(() => vi.unstubAllGlobals());

describe("cuentas y direcciones", () => {
  it("normaliza usuarios de Instagram", async () => {
    const { normalizeUsername } = await import("@/lib/analyzer/schemas");
    expect(normalizeUsername("@Cuenta.Uno")).toBe("cuenta.uno");
    expect(normalizeUsername("https://www.instagram.com/mi_cuenta/?hl=es")).toBe("mi_cuenta");
    expect(normalizeUsername("../../etc")).toBeNull();
    expect(normalizeUsername("a b")).toBeNull();
    expect(normalizeUsername("x".repeat(31))).toBeNull();
  });
  it("entiende los enlaces de perfil que se copian desde el celular", async () => {
    const { normalizeUsername } = await import("@/lib/analyzer/schemas");
    expect(normalizeUsername("https://www.instagram.com/disenarte.mx?igsh=MXN4ZXFkbG5oMWhz")).toBe("disenarte.mx");
    expect(normalizeUsername("https://instagram.com/_u/Disenarte.MX/")).toBe("disenarte.mx"); // enlace de la app al compartir
    expect(normalizeUsername("https://m.instagram.com/mi_cuenta/reels/")).toBe("mi_cuenta");
    expect(normalizeUsername("instagram.com/mi_cuenta")).toBe("mi_cuenta");
    expect(normalizeUsername("  @Mi_Cuenta  ")).toBe("mi_cuenta");
    expect(normalizeUsername("https://instagr.am/mi_cuenta")).toBe("mi_cuenta");
  });
  it("un enlace de video o publicación NO se lee como una cuenta llamada «reel»", async () => {
    const { normalizeUsername, notAProfileMessage } = await import("@/lib/analyzer/schemas");
    for (const link of ["https://www.instagram.com/reel/DAbC123xyz/", "https://www.instagram.com/p/DAbC123/", "https://www.instagram.com/stories/cuenta/123/", "https://www.instagram.com/share/BAbc", "https://www.instagram.com/"]) {
      expect(normalizeUsername(link)).toBeNull();
    }
    expect(notAProfileMessage("https://www.instagram.com/reel/DAbC123xyz/")).toMatch(/video o una publicación/);
    expect(notAProfileMessage("https://www.instagram.com/cuenta")).toBeNull();
    expect(notAProfileMessage("@cuenta")).toBeNull();
    expect(normalizeUsername("@reel")).toBe("reel"); // pero un usuario escrito a mano sí puede llamarse así
  });
  it("solo descarga de servidores de contenido de Instagram", async () => {
    const { isMediaUrl } = await import("@/lib/analyzer/media");
    expect(isMediaUrl("https://scontent-dfw5-1.cdninstagram.com/v/t50/abc.mp4")).toBe(true);
    expect(isMediaUrl("https://scontent.xx.fbcdn.net/v/abc.jpg")).toBe(true);
    expect(isMediaUrl("http://scontent.cdninstagram.com/abc.mp4")).toBe(false);
    expect(isMediaUrl("https://localhost/abc")).toBe(false);
    expect(isMediaUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isMediaUrl("https://cdninstagram.com.evil.com/x")).toBe(false);
    expect(isMediaUrl("https://cdninstagram.com:8443/x")).toBe(false);
  });
  it("corta una descarga que pasa del tope", async () => {
    const { downloadLimited } = await import("@/lib/analyzer/media");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(2000), { status: 200, headers: { "content-type": "video/mp4" } })));
    await expect(downloadLimited("https://x.cdninstagram.com/v.mp4", 1000)).rejects.toThrow(/grande/);
    const ok = await downloadLimited("https://x.cdninstagram.com/v.mp4", 5000);
    expect(ok.data.length).toBe(2000);
    await expect(downloadLimited("https://evil.com/v.mp4", 5000)).rejects.toThrow(/no permitida/);
  });
  it("deja solo los reels con video dentro de la ventana", async () => {
    const { pickTop } = await import("@/lib/analyzer/apify");
    const since = new Date("2026-10-01");
    const r = pickTop(
      [
        { videoUrl: "https://a.cdninstagram.com/1.mp4", url: "https://instagram.com/reel/1", timestamp: "2026-10-10T10:00:00Z", videoPlayCount: 900 },
        { url: "https://instagram.com/p/2", timestamp: "2026-10-10T10:00:00Z" }, // foto
        { videoUrl: "https://a.cdninstagram.com/3.mp4", url: "https://instagram.com/reel/3", timestamp: "2026-08-10T10:00:00Z", videoPlayCount: 5 }, // viejo
      ],
      "cuenta",
      since,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.views).toBe(900);
  });
});

describe("competidores y corridas", () => {
  it("agrega, no duplica y respeta el máximo", async () => {
    const svc = await import("@/lib/analyzer/service");
    expect((await svc.addCompetitor(userId, "@uno")).ok).toBe(true);
    expect((await svc.addCompetitor(userId, "UNO")).ok).toBe(false);
    expect((await svc.addCompetitor(userId, "no valido!")).ok).toBe(false);
    for (let i = 2; i <= 8; i++) expect((await svc.addCompetitor(userId, `cuenta${i}`)).ok).toBe(true);
    expect((await svc.addCompetitor(userId, "cuenta9")).ok).toBe(false);
    const list = await svc.listCompetitors(userId);
    for (const c of list.slice(3)) await svc.removeCompetitor(userId, c.id);
    expect(await svc.listCompetitors(userId)).toHaveLength(3);
  }, 30_000);

  it("corre con datos de ejemplo sin llaves y limita a una vez por semana", async () => {
    const svc = await import("@/lib/analyzer/service");
    const start = await svc.startRun(userId);
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect((await svc.startRun(userId)).ok).toBe(false); // ya hay uno en curso
    await svc.runAnalyzer(userId, start.runId);
    const run = (await svc.getRun(userId, start.runId))!;
    expect(run.status).toBe("lista");
    expect(run.mock).toBe(true);
    const videos = await svc.listVideos(userId, start.runId);
    expect(videos.length).toBe(3);
    expect(svc.parseConcepts(videos[0]!.concepts)?.conceptos).toHaveLength(3);
    expect(svc.parseAnalysis(videos[0]!.analysis)?.gancho.por_que_funciona).toBeTruthy();

    const again = await svc.startRun(userId);
    expect(again.ok).toBe(false);
    expect(!again.ok && again.error).toMatch(/una vez por semana/);

    // Pasados 7 días se permite otra.
    await pdb.update(schema.analyzerRuns).set({ createdAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(schema.analyzerRuns.id, start.runId));
    expect((await svc.startRun(userId)).ok).toBe(true);
  }, 30_000);

  it("una corrida que falla no gasta el límite semanal", async () => {
    const svc = await import("@/lib/analyzer/service");
    await pdb.update(schema.analyzerRuns).set({ status: "error" }).where(eq(schema.analyzerRuns.userId, userId));
    expect(await svc.nextAllowedAt(userId)).toBeNull();
  });

  it("marca y desmarca favoritos solo del dueño", async () => {
    const svc = await import("@/lib/analyzer/service");
    const [v] = await svc.listVideos(userId);
    await svc.toggleStar(userId, v!.id);
    expect((await svc.listVideos(userId)).find((x) => x.id === v!.id)!.starred).toBe(true);
    const [other] = await pdb.insert(schema.users).values({ email: "otra@correo.com", name: "Otra", passwordHash: "x" }).returning();
    await svc.toggleStar(other!.id, v!.id);
    expect((await svc.listVideos(userId)).find((x) => x.id === v!.id)!.starred).toBe(true);
  });
});
