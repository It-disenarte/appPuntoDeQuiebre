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

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
}, 30_000);

const mkUser = async (email: string, extra: Partial<typeof schema.users.$inferInsert> = {}) => (await pdb.insert(schema.users).values({ email, name: email.split("@")[0]!, passwordHash: "x", ...extra }).returning())[0]!;

describe("eliminar cuentas desactivadas", () => {
  it("solo elimina creadores desactivados y pide el correo exacto", async () => {
    const { deleteDisabledUser } = await import("@/lib/admin/delete-user");
    const active = await mkUser("activa@x.com");
    const admin = await mkUser("admin@x.com", { role: "admin", status: "disabled" });
    const off = await mkUser("baja@x.com", { status: "disabled" });
    expect((await deleteDisabledUser(active.id, "activa@x.com")).ok).toBe(false); // sigue activa
    expect((await deleteDisabledUser(admin.id, "admin@x.com")).ok).toBe(false); // admin
    const wrong = await deleteDisabledUser(off.id, "otro@x.com");
    expect(wrong.ok).toBe(false);
    expect(!wrong.ok && wrong.error).toMatch(/correo/);
    expect((await deleteDisabledUser("00000000-0000-4000-8000-000000000000", "x")).ok).toBe(false);
    expect(await pdb.select().from(schema.users).where(eq(schema.users.id, off.id))).toHaveLength(1);
  }, 30_000);

  it("no borra a quien todavía tiene una suscripción viva", async () => {
    const { deleteDisabledUser } = await import("@/lib/admin/delete-user");
    const u = await mkUser("conplan@x.com", { status: "disabled" });
    await pdb.insert(schema.subscriptions).values({ userId: u.id, providerSubscriptionId: "sub_1", plan: "basico", status: "active" });
    const r = await deleteDisabledUser(u.id, "conplan@x.com");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Stripe/);
    await pdb.update(schema.subscriptions).set({ status: "canceled" }).where(eq(schema.subscriptions.userId, u.id));
    expect((await deleteDisabledUser(u.id, "CONPLAN@x.com")).ok).toBe(true); // el correo no distingue mayúsculas
  }, 30_000);

  it("borra sus datos en cascada y todos sus archivos, y deja la bitácora", async () => {
    const { deleteDisabledUser, collectFileKeys } = await import("@/lib/admin/delete-user");
    const u = await mkUser("adios@x.com", { status: "disabled" });
    const [plan] = await pdb.insert(schema.weekPlans).values({ userId: u.id, weekStart: "2026-10-19", tier: "basico", skillVersion: "t", stage: "arranque", mix: { viral: 50, nicho: 50, conversion: 0 } }).returning();
    const [piece] = await pdb.insert(schema.contentPieces).values({ planId: plan!.id, userId: u.id, n: 1, day: "2026-10-20", publishTime: "08:00", kind: "video", category: "viral", type: "probado", pillar: "p", topic: "T", script: {} }).returning();
    await pdb.insert(schema.recordings).values({ userId: u.id, pieceId: piece!.id, part: "gancho", objectKey: "rec-1", contentType: "video/mp4", bytes: 1, seconds: 1 });
    await pdb.insert(schema.videoExports).values({ userId: u.id, pieceId: piece!.id, status: "lista", objectKey: "exp-1" });
    await pdb.insert(schema.kitPhotos).values({ userId: u.id, storageKey: "kit-1", contentType: "image/jpeg", size: 1 });
    await pdb.insert(schema.metricReports).values({ userId: u.id, period: "2026-09", status: "captura", shotKeys: ["shot-1", "shot-2"] });
    await pdb.insert(schema.carousels).values({ userId: u.id, brief: {}, images: { "2": { key: "car-1", focalX: 50, focalY: 50 } } });
    await pdb.insert(schema.profileOpt).values({ userId: u.id, photos: [{ key: "perfil-1", at: "x", result: {}, mock: false }] });
    await pdb.insert(schema.payments).values({ userId: u.id, providerInvoiceId: "in_x", amountCents: 100, currency: "mxn", paidAt: new Date() });
    await pdb.insert(schema.auditLog).values({ action: "auth.login", actorUserId: u.id, targetUserId: u.id });
    expect((await collectFileKeys(u.id)).sort()).toEqual(["car-1", "exp-1", "kit-1", "perfil-1", "rec-1", "shot-1", "shot-2"]);

    const r = await deleteDisabledUser(u.id, "adios@x.com");
    expect(r.ok && r.files).toBe(7);
    expect(await pdb.select().from(schema.users).where(eq(schema.users.id, u.id))).toHaveLength(0);
    for (const t of [schema.recordings, schema.videoExports, schema.kitPhotos, schema.metricReports, schema.carousels, schema.profileOpt, schema.payments, schema.weekPlans, schema.contentPieces]) {
      expect(await pdb.select().from(t)).toSatisfy((rows: { userId?: string }[]) => rows.every((x) => x.userId !== u.id));
    }
    expect(["rec-1", "exp-1", "kit-1", "shot-1", "shot-2", "car-1", "perfil-1"].every((k) => holder.deleted.includes(k))).toBe(true);
    const log = await pdb.select().from(schema.auditLog);
    expect(log.length).toBeGreaterThan(0); // la bitácora se conserva
    expect(log.every((l) => l.targetUserId !== u.id)).toBe(true);
  }, 30_000);
});
