import { writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { buildVoFilterScript, voEditArgs } from "@/lib/edit/render-args";
import { EMPTY_OVERRIDES, normalizePlan, normalizeVoTramos, planSchema } from "@/lib/edit/schemas";
import { planSegments } from "@/lib/edit/timeline";

const holder = vi.hoisted(() => ({ db: null as unknown, calls: [] as string[][] }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/storage", () => ({
  deleteObject: async () => undefined,
  getObject: async () => ({ body: new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])).body!, contentType: "video/mp4", contentLength: 8, contentRange: undefined, partial: false }),
  putObjectStream: async (_k: string, body: AsyncIterable<unknown>) => {
    for await (const _ of body) void _;
  },
  storageConfigured: () => true,
}));
vi.mock("@/lib/recording/ffmpeg", async (orig) => {
  const real = await orig<typeof import("@/lib/recording/ffmpeg")>();
  return { ...real, probeVideo: async () => ({ duration: 12, width: 1080 }), runFfmpeg: async (args: string[]) => (holder.calls.push(args), void (await writeFile(args[args.length - 1]!, Buffer.alloc(64)))) };
});

const tr = (clip: number, inicio_s: number, fin_s: number, desde_s = 0, hasta_s = fin_s - inicio_s) => ({ clip, desde_s, hasta_s, inicio_s, fin_s, que_se_ve: "", frase: "" });

describe("tramos de la voz en off (reglas por código)", () => {
  it("cubren toda la voz sin huecos ni traslapes y respetan la duración de cada toma", () => {
    const out = normalizeVoTramos([tr(2, 4, 8), tr(1, 0.5, 3.5), tr(1, 7, 11)], 12, [5, 6]);
    expect(out.map((t) => [t.clip, t.inicio_s, t.fin_s])).toEqual([
      [1, 0, 3.5], // el hueco antes del primero se cubre desde 0
      [2, 3.5, 8],
      [1, 8, 12],
    ]);
    // La toma 1 dura 5 s: ningún tramo puede pedir más de lo que existe.
    for (const t of out) expect(t.hasta_s).toBeLessThanOrEqual([5, 6][t.clip - 1]! + 1e-9);
    // Y nunca se usa más de lo que dura el tramo.
    for (const t of out) expect(t.hasta_s - t.desde_s).toBeLessThanOrEqual(t.fin_s - t.inicio_s + 1e-9);
  });

  it("una toma que no existe se manda a la más cercana y lo que no cabe se descarta", () => {
    const out = normalizeVoTramos([tr(9, 0, 5), tr(0, 5, 5.2), tr(1, 5, 10)], 10, [8, 8]);
    expect(out.map((t) => t.clip)).toEqual([2, 1]);
    expect(out.at(-1)!.fin_s).toBe(10);
    expect(normalizeVoTramos([], 10, [8])).toEqual([]);
    expect(normalizeVoTramos([tr(1, 0, 5)], 10, [])).toEqual([]);
  });

  it("el plan completo se normaliza con las duraciones de las tomas y el video final dura lo que la voz", () => {
    const plan = planSchema.parse({ modo: "voz_en_off", tramos_voz: [tr(1, 0, 6), tr(2, 6, 99)] });
    const p = normalizePlan(plan, 12, [10, 10]);
    expect(p.tramos_voz.at(-1)!.fin_s).toBe(12);
    expect(planSegments(p, EMPTY_OVERRIDES, 12)).toEqual([{ a: 0, b: 12, offset: 0 }]);
  });
});

describe("ffmpeg de la voz en off", () => {
  it("arma un recorte por tramo, los une sin audio de las tomas y usa la voz como audio", () => {
    const tramos = normalizeVoTramos([tr(1, 0, 4), tr(2, 4, 9), tr(1, 9, 12, 2, 5)], 12, [6, 8]);
    const script = buildVoFilterScript({ tramos, assPath: "/tmp/e.ass", fontsDir: "/tmp/fonts" });
    expect(script.match(/trim=start=/g)).toHaveLength(3);
    expect(script).toContain("[1:v]trim=start=0.000"); // la toma 2 es la entrada 1
    expect(script).toContain("concat=n=3:v=1:a=0[vc]");
    expect(script).toContain("tpad=stop_mode=clone");
    expect(script).toContain("subtitles=filename=");
    const args = voEditArgs(["/a.mp4", "/b.mp4"], "/voz.m4a", script, "/out.mp4");
    expect(args.filter((a) => a === "-i")).toHaveLength(3);
    expect(args[args.indexOf("-map") + 1]).toBe("[v]");
    expect(args).toContain("2:a"); // la voz es la última entrada
    expect(args).toContain("-shortest");
    expect(() => buildVoFilterScript({ tramos: [], assPath: "a", fontsDir: "b" })).toThrow();
  });
});

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";
let freeId = "";
let pieceId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "vo@x.com", name: "Vo", passwordHash: "x" }).returning();
  userId = u!.id;
  const [f] = await pdb.insert(schema.users).values({ email: "free@x.com", name: "Free", passwordHash: "x" }).returning();
  freeId = f!.id;
  await pdb.insert(schema.subscriptions).values({ userId, providerSubscriptionId: "sub_vo", plan: "pro", status: "active" });
  const [plan] = await pdb.insert(schema.weekPlans).values({ userId, weekStart: "2026-10-19", tier: "pro", skillVersion: "t", stage: "arranque", mix: { viral: 50, nicho: 50, conversion: 0 } }).returning();
  const [p] = await pdb.insert(schema.contentPieces).values({ planId: plan!.id, userId, n: 1, day: "2026-10-20", publishTime: "08:00", kind: "video", category: "viral", type: "probado", pillar: "Proceso", topic: "Mi rutina de mañana", script: { gancho: "Así empiezo mi día", cuerpo: ["Primero el café", "Luego mi cuaderno"], cierre: "Sígueme para más" } }).returning();
  pieceId = p!.id;
}, 30_000);

describe("edición de voz en off (sin IA: plan de ejemplo)", () => {
  it("no deja pedirla sin plan Pro, sin tomas o sin voz", async () => {
    const svc = await import("@/lib/edit/service");
    const vo = await import("@/lib/edit/voiceover");
    expect((await svc.requestEdit(freeId, pieceId, "voz_en_off")).ok).toBe(false);
    const noClips = await svc.requestEdit(userId, pieceId, "voz_en_off");
    expect(!noClips.ok && noClips.error).toMatch(/toma/);
    await pdb.insert(schema.looseClips).values([1, 2, 3].map((i) => ({ userId, pieceId, objectKey: `tomas/${i}`, contentType: "video/mp4", bytes: 100, seconds: 6, position: i - 1 })));
    const noVoice = await svc.requestEdit(userId, pieceId, "voz_en_off");
    expect(!noVoice.ok && noVoice.error).toMatch(/voz/);
    expect(await vo.getVoiceover(userId, pieceId)).toBeNull();
  });

  it("planea sobre la voz, deja revisar y arma el video con las tomas y la voz", async () => {
    const svc = await import("@/lib/edit/service");
    const vo = await import("@/lib/edit/voiceover");
    await vo.commitVoiceover({ userId, pieceId, key: "voces/1", contentType: "audio/mp4", bytes: 200, seconds: 12 });
    expect((await svc.requestEdit(userId, pieceId, "voz_en_off")).ok).toBe(true);
    const e = (await svc.getEdit(userId, pieceId))!;
    expect(e.mode).toBe("voz_en_off");
    await svc.runPlan(userId, e.id);
    const planned = (await svc.getEdit(userId, pieceId))!;
    expect(planned.status).toBe("revision");
    const plan = svc.parsePlan(planned.plan)!;
    expect(plan.modo).toBe("voz_en_off");
    expect(plan.tramos_voz).toHaveLength(3);
    expect(plan.tramos_voz[0]!.inicio_s).toBe(0);
    expect(plan.tramos_voz.at(-1)!.fin_s).toBe(12);
    const restore = await svc.toggleCut(userId, pieceId, 0);
    expect(restore.ok).toBe(false);

    expect((await svc.requestRender(userId, pieceId)).ok).toBe(true);
    holder.calls.length = 0;
    await svc.runRender(userId, planned.id);
    const done = (await svc.getEdit(userId, pieceId))!;
    expect(done.status).toBe("lista");
    expect(done.outputSeconds).toBe(12);
    const main = holder.calls.find((c) => c.includes("-filter_complex"))!;
    expect(main.filter((a) => a === "-i")).toHaveLength(4); // 3 tomas + la voz
    expect(main).toContain("3:a");
    // Un video de voz en off cuenta como grabado.
    const [piece] = await pdb.select().from(schema.contentPieces);
    expect(piece!.status).toBe("grabado");
  }, 30_000);

  it("al borrar la voz ya no se puede volver a pedir hasta grabar otra", async () => {
    const svc = await import("@/lib/edit/service");
    const vo = await import("@/lib/edit/voiceover");
    await vo.removeVoiceover(userId, pieceId);
    const r = await svc.requestEdit(userId, pieceId, "voz_en_off");
    expect(!r.ok && r.error).toMatch(/voz/);
  });
});

const FF = process.env.FFMPEG_BIN;
const FP = process.env.FFPROBE_BIN;
(FF && FP ? describe : describe.skip)("voz en off con ffmpeg real", () => {
  it("une tomas de distinto tamaño sobre la voz, repite el último cuadro de una toma corta y deja solo la voz como audio", async () => {
    const { spawnSync } = await import("node:child_process");
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const sh = (bin: string, args: string[]) => {
      const r = spawnSync(bin, args, { encoding: "utf8" });
      if (r.status !== 0) throw new Error(`${path.basename(bin)} falló: ${r.stderr.slice(-500)}`);
      return r.stdout;
    };
    const dir = await mkdtemp(path.join(tmpdir(), "pdq-vo-real-"));
    try {
      const a = path.join(dir, "a.mp4"); // horizontal, 4 s, con audio que no debe oírse
      const b = path.join(dir, "b.mp4"); // vertical, 3 s
      const voz = path.join(dir, "voz.m4a");
      sh(FF!, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24", "-f", "lavfi", "-i", "sine=frequency=900", "-t", "4", "-pix_fmt", "yuv420p", a]);
      sh(FF!, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30", "-t", "3", "-pix_fmt", "yuv420p", b]);
      sh(FF!, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300", "-t", "9", "-c:a", "aac", voz]);
      const tramos = normalizeVoTramos([tr(1, 0, 4, 0, 4), tr(2, 4, 9, 0, 3)], 9, [4, 3]); // el segundo tramo pide 5 s de una toma de 3 s
      const ass = path.join(dir, "e.ass");
      await writeFile(ass, "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,300,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,Hola\n");
      const out = path.join(dir, "out.mp4");
      sh(FF!, voEditArgs([a, b], voz, buildVoFilterScript({ tramos, assPath: ass, fontsDir: dir }), out));
      const j = JSON.parse(sh(FP!, ["-v", "error", "-print_format", "json", "-show_entries", "format=duration:stream=width,height,codec_type", out])) as { format: { duration: string }; streams: { codec_type: string; width?: number; height?: number }[] };
      expect(Math.abs(Number(j.format.duration) - 9)).toBeLessThan(0.5);
      const v = j.streams.find((s) => s.codec_type === "video")!;
      expect([v.width, v.height]).toEqual([1080, 1920]);
      expect(j.streams.filter((s) => s.codec_type === "audio")).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
