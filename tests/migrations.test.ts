import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";

const client = new PGlite();
const db = drizzle(client, { schema, casing: "snake_case" });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("migraciones y restricciones", () => {
  it("crea usuarios con valores por defecto seguros", async () => {
    const [u] = await db.insert(schema.users).values({ email: "ana@correo.com", name: "Ana", passwordHash: "x" }).returning();
    expect(u!.role).toBe("creator");
    expect(u!.status).toBe("active");
    expect(u!.mustChangePassword).toBe(false);
  });

  it("el correo es único sin importar mayúsculas", async () => {
    await expect(db.insert(schema.users).values({ email: "ANA@correo.com", name: "Otra", passwordHash: "x" })).rejects.toThrow();
  });

  it("borra sesiones en cascada al borrar el usuario", async () => {
    const [u] = await db.insert(schema.users).values({ email: "b@correo.com", name: "B", passwordHash: "x" }).returning();
    await db.insert(schema.sessions).values({ id: "h".repeat(64), userId: u!.id, expiresAt: new Date(Date.now() + 1000), ip: "203.0.113.9" });
    await db.delete(schema.users).where(eq(schema.users.id, u!.id));
    const [{ n }] = (await db.execute(sql`select count(*)::int as n from sessions`)).rows as [{ n: number }];
    expect(n).toBe(0);
  });

  it("rechaza IPs inválidas en columnas inet", async () => {
    await expect(db.insert(schema.loginAttempts).values({ email: "x@x.com", ip: "no-es-ip", succeeded: false })).rejects.toThrow();
  });
});
