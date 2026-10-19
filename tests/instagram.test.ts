import { createHmac } from "node:crypto";
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
let otherId = "";
const SECRET = "secreto-de-la-app-de-meta-123456";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  process.env.META_APP_ID = "123456789";
  process.env.META_APP_SECRET = SECRET;
  process.env.TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "ig@correo.com", name: "Ig", passwordHash: "x" }).returning();
  const [o] = await pdb.insert(schema.users).values({ email: "ig2@correo.com", name: "Ig2", passwordHash: "x" }).returning();
  userId = u!.id;
  otherId = o!.id;
}, 30_000);
afterEach(() => vi.unstubAllGlobals());

/** fetch simulado con la forma documentada de las respuestas de Instagram. */
function stubInstagram(opts: { accountType?: string; failInsights?: boolean; expired?: boolean } = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
      if (opts.expired) return json({ error: { message: "Invalid OAuth access token", code: 190 } }, 400);
      if (url.startsWith("https://api.instagram.com/oauth/access_token")) return json({ access_token: "TOKEN_CORTO", user_id: 1789 });
      if (url.includes("/access_token?grant_type=ig_exchange_token")) return json({ access_token: "TOKEN_LARGO", expires_in: 5_184_000 });
      if (url.includes("refresh_access_token")) return json({ access_token: "TOKEN_RENOVADO", expires_in: 5_184_000 });
      if (url.includes("/me/media")) return json({ data: [{ id: "m1", media_type: "VIDEO", permalink: "https://www.instagram.com/reel/abc/", caption: "Mi reel", timestamp: "2026-10-18T15:00:00+0000", like_count: 40, comments_count: 3 }, { id: "m2", media_type: "IMAGE", timestamp: "2026-10-10T15:00:00+0000" }] });
      if (url.includes("/insights")) return opts.failInsights ? json({ error: { message: "metric not supported", code: 100 } }, 400) : json({ data: [{ name: "reach", values: [{ value: 900 }] }, { name: "saved", total_value: { value: 12 } }] });
      if (url.includes("/me?fields=")) return json({ user_id: "1789", username: "blombito", name: "Blombito", account_type: opts.accountType ?? "CREATOR", followers_count: 1520, follows_count: 80, media_count: 34 });
      return json({}, 404);
    }),
  );
  return calls;
}

describe("cifrado de secretos", () => {
  it("cifra y descifra, y detecta alteraciones", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const blob = encryptSecret("mi-token");
    expect(blob).not.toContain("mi-token");
    expect(decryptSecret(blob)).toBe("mi-token");
    expect(encryptSecret("mi-token")).not.toBe(blob); // IV distinto cada vez
    const parts = blob.split(".");
    parts[3] = Buffer.from("otra cosa").toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});

describe("firma de las devoluciones de Meta", () => {
  const sign = (payload: object, secret = SECRET) => {
    const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${createHmac("sha256", secret).update(p).digest("base64url")}.${p}`;
  };
  it("acepta solo solicitudes firmadas con el secreto de la app", async () => {
    const { parseSignedRequest } = await import("@/lib/instagram/service");
    expect(parseSignedRequest(sign({ user_id: 1789, algorithm: "HMAC-SHA256" }))?.user_id).toBe("1789");
    expect(parseSignedRequest(sign({ user_id: 1789 }, "otro-secreto-distinto-12345"))).toBeNull();
    expect(parseSignedRequest("basura")).toBeNull();
    expect(parseSignedRequest(sign({ user_id: 1, algorithm: "MD5" }))).toBeNull();
  });
});

describe("conexión con Instagram (API simulada)", () => {
  it("conecta, guarda el token cifrado y trae el perfil", async () => {
    const calls = stubInstagram();
    const svc = await import("@/lib/instagram/service");
    const r = await svc.completeConnection(userId, "CODIGO#_");
    expect(r.ok).toBe(true);
    const c = (await svc.getConnection(userId))!;
    expect(c.username).toBe("blombito");
    expect(c.tokenEnc).not.toContain("TOKEN_LARGO");
    expect(svc.profileOf(c)).toEqual({ followers: 1520, follows: 80, mediaCount: 34 });
    expect(calls.some((u) => u.includes("scope"))).toBe(false); // el permiso se pide en la autorización, no al canjear
    expect(c.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 50 * 86_400_000);
  });

  it("rechaza cuentas personales y cuentas ya conectadas a otro usuario", async () => {
    stubInstagram({ accountType: "PERSONAL" });
    const svc = await import("@/lib/instagram/service");
    const personal = await svc.completeConnection(otherId, "X");
    expect(personal.ok).toBe(false);
    expect(!personal.ok && personal.error).toMatch(/profesional/);
    stubInstagram();
    const dup = await svc.completeConnection(otherId, "X");
    expect(dup.ok).toBe(false);
    expect(!dup.ok && dup.error).toMatch(/otro usuario/);
  });

  it("sincroniza publicaciones y métricas; un insight que falla no detiene la sincronización", async () => {
    stubInstagram({ failInsights: true });
    const svc = await import("@/lib/instagram/service");
    expect((await svc.syncConnection(userId)).ok).toBe(true);
    const media = await svc.listMedia(userId);
    expect(media.map((m) => m.igMediaId)).toEqual(["m1", "m2"]); // la más reciente primero
    stubInstagram();
    await svc.syncConnection(userId);
    const m1 = (await svc.listMedia(userId)).find((m) => m.igMediaId === "m1")!;
    expect(m1.metrics).toMatchObject({ likes: 40, comments: 3, reach: 900, saved: 12 });
    expect(await pdb.select().from(schema.igMedia).where(eq(schema.igMedia.userId, userId))).toHaveLength(2); // sin duplicar
  });

  it("si el permiso caducó lo anota para pedir reconectar", async () => {
    stubInstagram({ expired: true });
    const svc = await import("@/lib/instagram/service");
    const r = await svc.syncConnection(userId);
    expect(r.ok).toBe(false);
    expect((await svc.getConnection(userId))!.lastError).toMatch(/caducó/);
  });

  it("renueva solo los permisos que vencen pronto", async () => {
    const svc = await import("@/lib/instagram/service");
    stubInstagram();
    expect((await svc.refreshExpiringTokens()).refreshed).toBe(0); // vence en ~60 días
    await pdb.update(schema.igConnections).set({ tokenExpiresAt: new Date(Date.now() + 5 * 86_400_000) }).where(eq(schema.igConnections.userId, userId));
    const r = await svc.refreshExpiringTokens();
    expect(r.refreshed).toBe(1);
    expect((await svc.getConnection(userId))!.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 50 * 86_400_000);
    expect((await svc.getConnection(userId))!.lastError).toBeNull();
  });

  it("desconectar borra la conexión y las publicaciones; la eliminación de datos de Meta también", async () => {
    const svc = await import("@/lib/instagram/service");
    await svc.disconnect(userId);
    expect(await svc.getConnection(userId)).toBeNull();
    expect(await pdb.select().from(schema.igMedia)).toHaveLength(0);
    stubInstagram();
    await svc.completeConnection(userId, "OTRO");
    expect(await svc.deleteByIgUser("1789")).toBe(true);
    expect(await svc.getConnection(userId)).toBeNull();
    expect(await svc.deleteByIgUser("no-existe")).toBe(false);
  });
});
