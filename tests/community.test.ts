import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => holder.db }));

const client = new PGlite();
const pdb = drizzle(client, { schema, casing: "snake_case" });
let adminId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [a] = await pdb.insert(schema.users).values({ email: "a@x.com", name: "A", passwordHash: "x", role: "admin" }).returning();
  adminId = a!.id;
}, 30_000);

describe("enlaces de la comunidad", () => {
  it("empieza vacía, guarda solo enlaces https y trata vacío como sin enlace", async () => {
    const { getCommunity, saveCommunity, hasCommunity } = await import("@/lib/community");
    expect(hasCommunity(await getCommunity())).toBe(false);
    expect((await saveCommunity({ discord: "http://inseguro.com" }, adminId)).ok).toBe(false);
    expect((await saveCommunity({ whatsapp: "javascript:alert(1)" }, adminId)).ok).toBe(false);
    expect((await saveCommunity({ discord: "https://discord.gg/abc", whatsapp: "", live: "", liveNote: "Jueves 7 p. m." }, adminId)).ok).toBe(true);
    const c = await getCommunity();
    expect(c.discord).toBe("https://discord.gg/abc");
    expect(c.whatsapp).toBeNull();
    expect(hasCommunity(c)).toBe(true);
  });
});
