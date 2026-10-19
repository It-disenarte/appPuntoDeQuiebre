import { writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown, deleted: [] as string[], uploaded: [] as string[], ffmpegArgs: [] as string[][], failFfmpeg: false }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/storage", () => ({
  deleteObject: async (k: string) => void holder.deleted.push(k),
  getObject: async () => ({ body: new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])).body!, contentType: "video/mp4", contentLength: 8, contentRange: undefined, partial: false }),
  putObjectStream: async (k: string, body: AsyncIterable<unknown>) => {
    for await (const _ of body) void _;
    holder.uploaded.push(k);
  },
  storageConfigured: () => true,
}));
vi.mock("@/lib/recording/ffmpeg", async (orig) => {
  const real = await orig<typeof import("@/lib/recording/ffmpeg")>();
  return {
    ...real,
    // En vez de llamar a ffmpeg, se anotan los argumentos y se crea el archivo de salida.
    runFfmpeg: async (args: string[]) => {
      holder.ffmpegArgs.push(args);
      if (holder.failFfmpeg) throw new Error("ffmpeg terminó con error 1: Invalid data");
      await writeFile(args[args.length - 1]!, Buffer.alloc(2048, 1));
    },
  };
});

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";
let pieceId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "vi@correo.com", name: "Vi", passwordHash: "x" }).returning();
  userId = u!.id;
  const [plan] = await pdb.insert(schema.weekPlans).values({ userId, weekStart: "2026-10-19", tier: "basico", skillVersion: "t", stage: "arranque", mix: { viral: 50, nicho: 50, conversion: 0 } }).returning();
  const [p] = await pdb.insert(schema.contentPieces).values({ planId: plan!.id, userId, n: 1, day: "2026-10-20", publishTime: "08:00", kind: "video", category: "viral", type: "probado", pillar: "p", topic: "Tema", script: { gancho: "g", cuerpo: ["a"], cierre: "c" } }).returning();
  pieceId = p!.id;
}, 30_000);

describe("argumentos de ffmpeg", () => {
  it("une las partes en 1080×1920 con audio y no usa shell", async () => {
    const { joinArgs } = await import("@/lib/recording/ffmpeg");
    const a = joinArgs(["a.mp4", "b.webm", "c.mov"], "out.mp4");
    expect(a.filter((x) => x === "-i")).toHaveLength(3);
    const graph = a[a.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain("concat=n=3:v=1:a=1");
    expect(graph).toContain("crop=1080:1920");
    expect(a).toContain("+faststart");
    expect(a.at(-1)).toBe("out.mp4");
    expect(() => joinArgs([], "x.mp4")).toThrow();
  });
});

describe("armar el video completo", () => {
  const addParts = async () => {
    for (const part of ["gancho", "cuerpo", "cierre"] as const) await pdb.insert(schema.recordings).values({ userId, pieceId, part, objectKey: `k-${part}`, contentType: part === "cuerpo" ? "video/webm" : "video/mp4", bytes: 8, seconds: 10 }).onConflictDoNothing();
  };

  it("exige las 3 partes", async () => {
    const svc = await import("@/lib/recording/join");
    expect((await svc.requestJoin(userId, pieceId)).ok).toBe(false);
  });

  it("encola, une en orden, guarda el resultado y limpia lo temporal", async () => {
    await addParts();
    const svc = await import("@/lib/recording/join");
    expect((await svc.requestJoin(userId, pieceId)).ok).toBe(true);
    expect((await svc.requestJoin(userId, pieceId)).ok).toBe(false); // ya está en proceso
    expect((await pdb.select().from(schema.jobs)).some((j) => j.kind === "video.unir")).toBe(true);
    await svc.runJoin(userId, pieceId);
    const exp = (await svc.getExport(userId, pieceId))!;
    expect(exp.status).toBe("lista");
    expect(exp.bytes).toBe(2048);
    expect(exp.seconds).toBe(30);
    expect(holder.uploaded.some((k) => k.startsWith(`exportaciones/${userId}/${pieceId}/`))).toBe(true);
    const inputs = holder.ffmpegArgs[0]!.filter((_, i, arr) => arr[i - 1] === "-i");
    expect(inputs.map((f) => f.split(/[\\/]/).pop())).toEqual(["gancho.mp4", "cuerpo.webm", "cierre.mp4"]); // en orden, con su extensión
  });

  it("avisa si quedó viejo tras regrabar y reemplaza el archivo anterior", async () => {
    const svc = await import("@/lib/recording/join");
    const before = (await svc.getExport(userId, pieceId))!;
    expect(await svc.isOutdated(userId, pieceId, before)).toBe(false);
    await pdb.update(schema.recordings).set({ updatedAt: new Date(Date.now() + 60_000) }).where(eq(schema.recordings.part, "cuerpo"));
    expect(await svc.isOutdated(userId, pieceId, before)).toBe(true);
    expect((await svc.requestJoin(userId, pieceId)).ok).toBe(true);
    await svc.runJoin(userId, pieceId);
    expect(holder.deleted).toContain(before.objectKey);
  });

  it("si ffmpeg falla deja el error visible y permite reintentar", async () => {
    const svc = await import("@/lib/recording/join");
    holder.failFfmpeg = true;
    expect((await svc.requestJoin(userId, pieceId)).ok).toBe(true);
    await expect(svc.runJoin(userId, pieceId)).rejects.toThrow(/ffmpeg/);
    const exp = (await svc.getExport(userId, pieceId))!;
    expect(exp.status).toBe("error");
    expect(exp.error).toMatch(/ffmpeg/);
    holder.failFfmpeg = false;
    expect((await svc.requestJoin(userId, pieceId)).ok).toBe(true);
    await svc.runJoin(userId, pieceId);
    expect((await svc.getExport(userId, pieceId))!.status).toBe("lista");
  });

  it("solo la dueña abre el archivo", async () => {
    const svc = await import("@/lib/recording/join");
    expect(await svc.openExport(userId, pieceId)).not.toBeNull();
    expect(await svc.openExport("00000000-0000-4000-8000-000000000000", pieceId)).toBeNull();
  });
});
