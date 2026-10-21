import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
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
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
  const [u] = await pdb.insert(schema.users).values({ email: "cortesia@x.com", name: "Cortesía", passwordHash: "x" }).returning();
  userId = u!.id;
  await pdb.insert(schema.subscriptions).values({ userId, providerSubscriptionId: "sub_c", plan: "basico", status: "active" });
}, 30_000);

describe("Pro de cortesía", () => {
  it("con el plan Básico no abre la edición; con la cortesía sí, y al quitarla vuelve a cerrarse", async () => {
    const { getSubscription } = await import("@/lib/billing/service");
    const { editQuota } = await import("@/lib/edit/service");
    expect((await getSubscription(userId))!.plan).toBe("basico");
    expect((await editQuota(userId)).allowed).toBe(false);

    await pdb.update(schema.users).set({ proOverride: true }).where(eq(schema.users.id, userId));
    expect((await getSubscription(userId))!.plan).toBe("pro");
    expect((await editQuota(userId)).allowed).toBe(true);
    // Lo guardado en la suscripción (lo que se cobra) no cambia.
    const [raw] = await pdb.select().from(schema.subscriptions);
    expect(raw!.plan).toBe("basico");

    await pdb.update(schema.users).set({ proOverride: false }).where(eq(schema.users.id, userId));
    expect((await editQuota(userId)).allowed).toBe(false);
  });
});
