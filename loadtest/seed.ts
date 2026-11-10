/**
 * Cuentas de prueba para la prueba de carga: crea N creadores con suscripción activa, compromiso aceptado y una sesión cada uno.
 * El token de cada sesión se DERIVA de una clave (--secreto), así k6 calcula los mismos tokens sin pasar archivos de un lado a otro,
 * y la carga no pasa por el inicio de sesión (argon2 es lento a propósito).
 *
 *   ALLOW_LOADTEST_SEED=1 npx tsx loadtest/seed.ts --users 50 --secreto UNA-CLAVE-LARGA --confirmo-que-no-es-produccion
 *   ALLOW_LOADTEST_SEED=1 npx tsx loadtest/seed.ts --limpiar --confirmo-que-no-es-produccion
 *
 * En el contenedor de la copia de pruebas (Easypanel → consola):  node dist/seed-carga.mjs --users 50 --secreto … --confirmo-que-no-es-produccion
 *
 * Seguros: hace falta la variable ALLOW_LOADTEST_SEED=1 (se pone SOLO en la copia de pruebas, jamás en producción) y la bandera
 * --confirmo-que-no-es-produccion. Siempre borra antes las cuentas @carga.test que hubiera, y nunca toca otras.
 */
import { createHmac } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { like } from "drizzle-orm";
import postgres from "postgres";
import { commitments, sessions, subscriptions, users } from "../src/lib/db/schema";
import { hashSessionToken } from "../src/lib/auth/tokens";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};

/** El mismo cálculo está en k6-app.js: HMAC-SHA256(clave, "carga-N") en base64url = 43 caracteres, el formato de un token de sesión. */
export const tokenFor = (secret: string, n: number) => createHmac("sha256", secret).update(`carga-${n}`).digest("base64url");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}
if (process.env.ALLOW_LOADTEST_SEED !== "1") {
  console.error("Este entorno no tiene ALLOW_LOADTEST_SEED=1. Eso es a propósito: solo se pone en la copia de PRUEBAS, nunca en producción.");
  process.exit(1);
}
const target = new URL(url);
console.log(`Base de datos: ${target.hostname}:${target.port || 5432}${target.pathname}`);
if (!flag("confirmo-que-no-es-produccion")) {
  console.error("Por seguridad agrega --confirmo-que-no-es-produccion (solo si esa base NO tiene usuarios reales).");
  process.exit(1);
}

const EMAIL_DOMAIN = "carga.test";
const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client, { casing: "snake_case" });

async function clean() {
  const gone = await db.delete(users).where(like(users.email, `%@${EMAIL_DOMAIN}`)).returning({ id: users.id });
  return gone.length;
}

async function main() {
  if (flag("limpiar")) {
    console.log(`Borradas ${await clean()} cuentas de prueba (y todo lo suyo, en cascada).`);
    return;
  }

  const secret = value("secreto", "");
  if (secret.length < 16) throw new Error("Pon una clave larga con --secreto (mínimo 16 caracteres). k6 usará la misma.");
  const total = Math.min(Math.max(Number(value("users", "50")), 1), 500);
  const plan = value("plan", "mix"); // basico | pro | mix (mitad y mitad)
  if (!["basico", "pro", "mix"].includes(plan)) throw new Error("--plan debe ser basico, pro o mix");

  const before = await clean();
  if (before) console.log(`(Se borraron ${before} cuentas de prueba anteriores.)`);
  const periodEnd = new Date(Date.now() + 30 * 86_400_000);
  let pro = 0;

  for (let i = 1; i <= total; i++) {
    const userPlan = plan === "mix" ? (i % 2 === 0 ? "pro" : "basico") : plan;
    if (userPlan === "pro") pro++;
    const [u] = await db
      .insert(users)
      .values({ email: `carga-${String(i).padStart(3, "0")}@${EMAIL_DOMAIN}`, name: `Carga ${i}`, passwordHash: "x-no-se-usa-para-iniciar-sesion", role: "creator", status: "active", birthDate: "1995-01-01", termsVersion: "carga", termsAcceptedAt: new Date() })
      .returning({ id: users.id });
    await db.insert(subscriptions).values({ userId: u!.id, providerSubscriptionId: `sub_carga_${i}`, plan: userPlan as "basico" | "pro", status: "active", currentPeriodEnd: periodEnd });
    await db.insert(commitments).values({ userId: u!.id, contentVersion: "carga", answers: {} });
    await db.insert(sessions).values({ id: hashSessionToken(tokenFor(secret, i)), userId: u!.id, expiresAt: new Date(Date.now() + 7 * 86_400_000), userAgent: "k6-carga", ip: null });
  }

  console.log(`Listo: ${total} cuentas (${pro} Pro, ${total - pro} Básico). Corre k6 con: -e SECRETO=<la misma clave> -e USUARIOS=${total}`);
  console.log("Cuando termines: node dist/seed-carga.mjs --limpiar --confirmo-que-no-es-produccion");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
