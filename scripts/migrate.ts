/**
 * Aplica las migraciones SQL de ./drizzle. Se ejecuta al arrancar el contenedor de la app.
 * Uso: node dist/migrate.mjs   (o npm run db:migrate en desarrollo)
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: process.env.MIGRATIONS_DIR ?? "./drizzle" });
    console.log("[migrate] migraciones aplicadas");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate] error", err);
  process.exit(1);
});
