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

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  process.env.TOKEN_ENC_KEY = Buffer.alloc(32, 3).toString("base64");
  delete process.env.ANTHROPIC_API_KEY;
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "au@correo.com", name: "Au", passwordHash: "x" }).returning();
  userId = u!.id;
}, 30_000);

const addMedia = async (n: number) => {
  for (let i = 0; i < n; i++) {
    await pdb.insert(schema.igMedia).values({ userId, igMediaId: `m${i}`, mediaType: i % 2 ? "VIDEO" : "IMAGE", caption: `Post ${i}`, postedAt: new Date(Date.now() - i * 86_400_000), metrics: { likes: 10 + i, comments: i, views: 100 * i } });
  }
};

describe("reglas por código de la auditoría", () => {
  it("con pocas publicaciones no hay tarjetas; con muchas, de 5 a 7; datos propios solo con 30 reels", async () => {
    const { shapeAudit, auditOutput } = await import("@/lib/audit-account/schemas");
    const card = (i: number) => ({ id: `t${i}`, tipo: "tema" as const, texto: `Tarjeta ${i}` });
    const base = auditOutput.parse({ modo: "completo", tarjetas: Array.from({ length: 10 }, (_, i) => card(i)), top_publicaciones: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}` })), preguntas_pendientes: ["a", "b", "c", "d", "e", "f"] });
    const few = shapeAudit(base, 5, 2);
    expect(few.modo).toBe("sin_contenido");
    expect(few.tarjetas).toHaveLength(0);
    const many = shapeAudit(base, 20, 31);
    expect(many.tarjetas).toHaveLength(7);
    expect(many.top_publicaciones).toHaveLength(5);
    expect(many.preguntas_pendientes).toHaveLength(4);
    expect(many.para_reglas.usa_datos_propios).toBe(true);
    expect(shapeAudit(base, 20, 29).para_reglas.usa_datos_propios).toBe(false);
  });
});

describe("auditoría de la cuenta conectada (sin IA)", () => {
  it("pide conectar Instagram primero", async () => {
    const svc = await import("@/lib/audit-account/service");
    const r = await svc.runAudit(userId);
    expect(r.ok).toBe(false);
  });

  it("con pocas publicaciones entra en modo sin contenido y no inventa tarjetas", async () => {
    const { encryptSecret } = await import("@/lib/crypto");
    await pdb.insert(schema.igConnections).values({ userId, igUserId: "99", username: "au", tokenEnc: encryptSecret("t"), tokenExpiresAt: new Date(Date.now() + 86_400_000 * 40), profile: { followers: 500, follows: 10, mediaCount: 3 } });
    await addMedia(4);
    const svc = await import("@/lib/audit-account/service");
    expect((await svc.runAudit(userId)).ok).toBe(true);
    const out = svc.parseAudit((await svc.getAudit(userId))!.result)!;
    expect(out.modo).toBe("sin_contenido");
    expect(out.tarjetas).toHaveLength(0);
    expect(out.preguntas_pendientes.length).toBeGreaterThan(0);
  });

  it("con 9 o más publicaciones genera tarjetas y guarda las respuestas del creador", async () => {
    await pdb.delete(schema.igMedia);
    await addMedia(12);
    const svc = await import("@/lib/audit-account/service");
    expect((await svc.runAudit(userId)).ok).toBe(true);
    const row = (await svc.getAudit(userId))!;
    const out = svc.parseAudit(row.result)!;
    expect(out.modo).toBe("completo");
    expect(out.tarjetas.length).toBeGreaterThanOrEqual(5);
    expect(out.numeros_clave.publicaciones_analizadas).toBe(12);
    expect((await svc.voteCard(userId, out.tarjetas[0]!.id, { voto: "ajustar", nota: "más o menos" })).ok).toBe(true);
    expect((await svc.voteCard(userId, "no-existe", { voto: "si" })).ok).toBe(false);
    expect((await svc.voteCard(userId, out.tarjetas[0]!.id, { voto: "tal vez" })).ok).toBe(false);
    expect(svc.parseVotes((await svc.getAudit(userId))!.votes)[out.tarjetas[0]!.id]).toMatchObject({ voto: "ajustar" });
  });
});
