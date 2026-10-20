import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown, deleted: [] as string[] }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/storage", () => ({ deleteObject: async (k: string) => void holder.deleted.push(k), getObject: async () => null, putObjectStream: async () => undefined, storageConfigured: () => true }));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";
let oldPiece = "";
let newPiece = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "ret@x.com", name: "Ret", passwordHash: "x" }).returning();
  userId = u!.id;
  const [plan] = await pdb.insert(schema.weekPlans).values({ userId, weekStart: "2026-09-01", tier: "basico", skillVersion: "t", stage: "arranque", mix: { viral: 50, nicho: 50, conversion: 0 } }).returning();
  const mk = async (n: number) => (await pdb.insert(schema.contentPieces).values({ planId: plan!.id, userId, n, day: "2026-09-02", publishTime: "08:00", kind: "video", category: "viral", type: "probado", pillar: "p", topic: `T${n}`, script: {}, status: "grabado" }).returning())[0]!.id;
  oldPiece = await mk(1);
  newPiece = await mk(2);
  const old = new Date(Date.now() - 40 * 86_400_000);
  for (const part of ["gancho", "cuerpo", "cierre"] as const) {
    await pdb.insert(schema.recordings).values({ userId, pieceId: oldPiece, part, objectKey: `old-${part}`, contentType: "video/mp4", bytes: 1, seconds: 1, updatedAt: old });
    await pdb.insert(schema.recordings).values({ userId, pieceId: newPiece, part, objectKey: `new-${part}`, contentType: "video/mp4", bytes: 1, seconds: 1 });
  }
  await pdb.update(schema.recordings).set({ updatedAt: old }).where(eq(schema.recordings.pieceId, oldPiece));
  await pdb.insert(schema.videoExports).values({ userId, pieceId: oldPiece, status: "lista", objectKey: "old-export" });
  await pdb.update(schema.videoExports).set({ updatedAt: old }).where(eq(schema.videoExports.pieceId, oldPiece));
  await pdb.insert(schema.videoEdits).values({ userId, pieceId: oldPiece, status: "lista", outputKey: "old-edit", coverKey: "old-cover" });
  await pdb.update(schema.videoEdits).set({ updatedAt: old }).where(eq(schema.videoEdits.pieceId, oldPiece));
}, 30_000);

describe("política de 30 días para los videos", () => {
  it("borra solo lo que pasó de 30 días, anota el motivo y la pieza sigue grabada", async () => {
    const { purgeOldVideos, PURGED_MESSAGE } = await import("@/lib/recording/retention");
    const r = await purgeOldVideos();
    expect(r).toEqual({ parts: 3, exports: 1, edits: 1 });
    expect(holder.deleted.sort()).toEqual(["old-cierre", "old-cover", "old-cuerpo", "old-edit", "old-export", "old-gancho"].sort());
    const parts = await pdb.select().from(schema.recordings);
    expect(parts.filter((p) => p.purgedAt).map((p) => p.pieceId)).toEqual([oldPiece, oldPiece, oldPiece]);
    expect(parts.filter((p) => p.pieceId === newPiece).every((p) => !p.purgedAt)).toBe(true);
    const [exp] = await pdb.select().from(schema.videoExports);
    expect(exp).toMatchObject({ status: "error", objectKey: null, error: PURGED_MESSAGE });
    const [edit] = await pdb.select().from(schema.videoEdits);
    expect(edit).toMatchObject({ status: "error", outputKey: null, coverKey: null });
    const [piece] = await pdb.select().from(schema.contentPieces).where(eq(schema.contentPieces.id, oldPiece));
    expect(piece!.status).toBe("grabado");
  }, 30_000);

  it("es idempotente y no deja unir partes ya borradas", async () => {
    const { purgeOldVideos } = await import("@/lib/recording/retention");
    expect(await purgeOldVideos()).toEqual({ parts: 0, exports: 0, edits: 0 });
    const { requestJoin } = await import("@/lib/recording/join");
    const r = await requestJoin(userId, oldPiece);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/30 días/);
  }, 30_000);
});
