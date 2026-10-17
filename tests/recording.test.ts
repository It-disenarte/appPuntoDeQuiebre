import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown, deleted: [] as string[] }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/storage", () => ({
  deleteObject: async (k: string) => void holder.deleted.push(k),
  getObject: async () => null,
  putObjectStream: async () => undefined,
  storageConfigured: () => true,
}));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let userId = "";
let pieceId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "rita@correo.com", name: "Rita", passwordHash: "x" }).returning();
  userId = u!.id;
  const [plan] = await pdb.insert(schema.weekPlans).values({ userId, weekStart: "2026-10-12", tier: "basico", skillVersion: "t", mix: { viral: 50, nicho: 40, conversion: 10 }, stage: "arranque" }).returning();
  const [p] = await pdb
    .insert(schema.contentPieces)
    .values({ planId: plan!.id, userId, n: 1, day: "2026-10-17", publishTime: "08:00", kind: "video", category: "viral", type: "probado", pillar: "p", topic: "Tema", script: { gancho: "g", cuerpo: ["a"], cierre: "c", duracion_segundos: 30 } })
    .returning();
  pieceId = p!.id;
});

describe("reglas de grabación", () => {
  it("separa el guion en gancho, cuerpo y cierre", async () => {
    const { partTexts, progress } = await import("@/lib/recording/rules");
    const t = partTexts({ gancho: " Hola ", cuerpo: ["Uno", " ", "Dos"], cierre: "Adiós", duracion_segundos: 30, nota_grabacion: "" });
    expect(t).toEqual({ gancho: "Hola", cuerpo: "Uno\n\nDos", cierre: "Adiós" });
    expect(progress(["gancho"]).next).toBe("cuerpo");
    expect(progress(["gancho", "cuerpo", "cierre"]).complete).toBe(true);
  });
  it("normaliza tipos y velocidades", async () => {
    const { baseType, clampSpeed, estimateSeconds } = await import("@/lib/recording/rules");
    expect(baseType("video/webm;codecs=vp9,opus")).toBe("video/webm");
    expect(clampSpeed(9)).toBe(5);
    expect(clampSpeed(NaN)).toBe(3);
    expect(estimateSeconds("uno dos tres cuatro cinco")).toBe(3);
  });
  it("reconoce el video por su contenido, no por el encabezado", async () => {
    const { matchesVideoSignature } = await import("@/lib/video-signature");
    const mp4 = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(matchesVideoSignature(mp4, "video/mp4")).toBe(true);
    expect(matchesVideoSignature(Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]), "video/mp4")).toBe(false);
  });
});

describe("partes grabadas", () => {
  const base = () => ({ userId, pieceId, contentType: "video/mp4", bytes: 1000, seconds: 5 });
  it("con las 3 partes la pieza queda grabada; al borrar una vuelve a pendiente", async () => {
    const svc = await import("@/lib/recording/service");
    const status = async () => (await pdb.select().from(schema.contentPieces).where(eq(schema.contentPieces.id, pieceId)))[0]!.status;
    await svc.commitRecording({ ...base(), part: "gancho", key: "k1" });
    await svc.commitRecording({ ...base(), part: "cuerpo", key: "k2" });
    expect(await status()).toBe("pendiente");
    const last = await svc.commitRecording({ ...base(), part: "cierre", key: "k3" });
    expect(await status()).toBe("grabado");
    expect(await svc.removeRecording(userId, last.id)).toBe(true);
    expect(await status()).toBe("pendiente");
    expect(holder.deleted).toContain("k3");
  });
  it("regrabar reemplaza la parte y borra el archivo anterior", async () => {
    const svc = await import("@/lib/recording/service");
    await svc.commitRecording({ ...base(), part: "gancho", key: "k1-nuevo" });
    const list = await svc.listRecordings(userId, pieceId);
    expect(list.filter((r) => r.part === "gancho")).toHaveLength(1);
    expect(list.find((r) => r.part === "gancho")!.objectKey).toBe("k1-nuevo");
    expect(holder.deleted).toContain("k1");
  });
  it("solo reconoce videos propios", async () => {
    const svc = await import("@/lib/recording/service");
    expect(await svc.ownsVideoPiece(userId, pieceId)).toBe(true);
    expect(await svc.ownsVideoPiece("00000000-0000-4000-8000-000000000000", pieceId)).toBe(false);
  });
});
