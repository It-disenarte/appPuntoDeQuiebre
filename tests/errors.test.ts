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

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.APP_URL = "https://app.example.com";
  holder.db = pdb;
  await migrate(pdb, { migrationsFolder: "./drizzle" });
}, 30_000);

describe("registro de errores del sistema", () => {
  it("agrupa el mismo error aunque cambien ids y números", async () => {
    const { normalize, signatureOf } = await import("@/lib/errors");
    expect(normalize("Falló el usuario 123e4567-e89b-12d3-a456-426614174000 con 5 intentos en https://x.com/a")).toBe("Falló el usuario <id> con # intentos en <url>");
    expect(signatureOf("ia", "brujula: error 500", "/a")).toBe(signatureOf("ia", "brujula: error 502", "/a"));
    expect(signatureOf("ia", "x", "/a")).not.toBe(signatureOf("trabajo", "x", "/a"));
  });

  it("cuenta repeticiones, detecta los que se repiten y permite marcarlos atendidos", async () => {
    const e = await import("@/lib/errors");
    await e.recordError({ source: "trabajo", message: "metricas.leer: Gemini respondió 500" });
    expect(await e.errorSummary()).toEqual({ open: 1, repeating: 0 });
    await e.recordError({ source: "trabajo", message: "metricas.leer: Gemini respondió 503" });
    await e.recordError({ source: "trabajo", message: "metricas.leer: Gemini respondió 429" });
    const [row] = await e.listErrors({ resolved: false });
    expect(row!.count).toBe(3);
    expect(e.isRepeating(row!)).toBe(true);
    expect(await e.errorSummary()).toEqual({ open: 1, repeating: 1 });
    await e.recordError({ source: "pagina", message: "Algo distinto", path: "/semana?x=1" });
    expect((await e.errorSummary()).open).toBe(2);
    expect((await e.listErrors({ resolved: false })).find((r) => r.source === "pagina")!.path).toBe("/semana"); // sin parámetros
    await e.resolveError(row!.id);
    expect((await e.errorSummary()).open).toBe(1);
    // Si vuelve a pasar, se reabre desde cero.
    await e.recordError({ source: "trabajo", message: "metricas.leer: Gemini respondió 500" });
    const [again] = await pdb.select().from(schema.appErrors).where(eq(schema.appErrors.id, row!.id));
    expect(again).toMatchObject({ resolved: false, count: 1 });
    await e.resolveAll();
    expect(await e.errorSummary()).toEqual({ open: 0, repeating: 0 });
  }, 30_000);

  it("un error al registrar nunca rompe a quien lo llama", async () => {
    const e = await import("@/lib/errors");
    holder.db = { insert: () => { throw new Error("BD caída"); } };
    await expect(e.recordError({ source: "ia", message: "x" })).resolves.toBeUndefined();
    holder.db = pdb;
  });
});

describe("filtro de cuentas desactivadas y costo por cliente", () => {
  it("filtra por estado de la cuenta", async () => {
    const { listClients } = await import("@/lib/admin/queries");
    await pdb.insert(schema.users).values([{ email: "on@x.com", name: "On", passwordHash: "x" }, { email: "off@x.com", name: "Off", passwordHash: "x", status: "disabled" }]);
    const off = await listClients({ account: "desactivada", page: 1 });
    expect(off.rows.map((r) => r.email)).toEqual(["off@x.com"]);
    const on = await listClients({ account: "activa", page: 1 });
    expect(on.rows.map((r) => r.email)).toEqual(["on@x.com"]);
    expect((await listClients({ page: 1 })).total).toBe(2);
  }, 30_000);
});
