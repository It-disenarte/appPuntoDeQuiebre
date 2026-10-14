import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

// Una sola conexión por proceso (evita fugas de conexiones con el recargado en caliente de desarrollo).
const globalForDb = globalThis as unknown as { pdqSql?: postgres.Sql; pdqDb?: Database };

function create(): Database {
  if (env().NODE_ENV === "production" && env().DATABASE_POOL_MAX < 3) {
    // DATABASE_POOL_MAX=1 es solo para PGlite en local; en producción estrangula la app.
    console.warn(`[db] DATABASE_POOL_MAX=${env().DATABASE_POOL_MAX} en producción. ¿Copiaste .env.example? Bórrala para usar 10.`);
  }
  const client =
    globalForDb.pdqSql ??
    postgres(env().DATABASE_URL, {
      max: env().DATABASE_POOL_MAX,
      idle_timeout: 30,
      connect_timeout: 10,
      prepare: true,
    });
  globalForDb.pdqSql = client;
  return drizzle(client, { schema, casing: "snake_case" });
}

export function db(): Database {
  globalForDb.pdqDb ??= create();
  return globalForDb.pdqDb;
}

export { schema };
