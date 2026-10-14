/**
 * Herramientas de administración por consola (se ejecutan desde la terminal del contenedor en Easypanel).
 *
 *   node dist/cli.mjs create-admin <correo> "<Nombre completo>"
 *   node dist/cli.mjs reset-password <correo>
 *   node dist/cli.mjs list-admins
 *
 * Las contraseñas generadas son temporales: el usuario debe cambiarlas al entrar.
 */
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import { generateTemporaryPassword, hashPassword } from "../src/lib/auth/password";
import { auditLog, sessions, users } from "../src/lib/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}
const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client, { casing: "snake_case" });

const emailSchema = z.string().trim().toLowerCase().email().max(254);

async function findByEmail(email: string) {
  const [u] = await db.select().from(users).where(eq(sql`lower(${users.email})`, email)).limit(1);
  return u;
}

function printPassword(email: string, password: string) {
  console.log("\n  Correo:               " + email);
  console.log("  Contraseña temporal:  " + password);
  console.log("\n  Compártela por un canal privado. Se pedirá cambiarla al entrar.\n");
}

async function createAdmin(rawEmail?: string, rawName?: string) {
  const email = emailSchema.parse(rawEmail);
  const name = z.string().trim().min(2).max(120).parse(rawName);
  if (await findByEmail(email)) throw new Error(`Ya existe un usuario con ${email}`);
  const password = generateTemporaryPassword();
  const [created] = await db
    .insert(users)
    .values({ email, name, passwordHash: await hashPassword(password), role: "admin", mustChangePassword: true })
    .returning({ id: users.id });
  await db.insert(auditLog).values({ action: "cli.create_admin", targetUserId: created!.id, meta: { email } });
  printPassword(email, password);
}

async function resetPassword(rawEmail?: string) {
  const email = emailSchema.parse(rawEmail);
  const user = await findByEmail(email);
  if (!user) throw new Error(`No existe ${email}`);
  const password = generateTemporaryPassword();
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.insert(auditLog).values({ action: "cli.reset_password", targetUserId: user.id, meta: { email } });
  });
  printPassword(email, password);
}

async function listAdmins() {
  const rows = await db.select({ email: users.email, name: users.name, status: users.status }).from(users).where(eq(users.role, "admin"));
  if (rows.length === 0) console.log("No hay administradores.");
  for (const r of rows) console.log(`${r.email}\t${r.name}\t${r.status}`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "create-admin":
      return createAdmin(args[0], args[1]);
    case "reset-password":
      return resetPassword(args[0]);
    case "list-admins":
      return listAdmins();
    default:
      console.log('Comandos: create-admin <correo> "<Nombre>" · reset-password <correo> · list-admins');
      process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof z.ZodError ? "Datos inválidos: " + err.issues.map((i) => i.message).join(", ") : err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
