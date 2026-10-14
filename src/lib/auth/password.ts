import { hash, verify } from "@node-rs/argon2";
import { randomInt } from "node:crypto";

// Parámetros argon2id recomendados por OWASP (19 MiB, 2 iteraciones, 1 hilo).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export { checkPasswordPolicy, PASSWORD_MAX, PASSWORD_MIN } from "./password-rules";

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Hash fijo para comparar cuando el correo no existe: iguala el tiempo de respuesta
// y evita revelar qué correos están registrados.
let dummyHash: Promise<string> | undefined;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("pdq-dummy-password-for-timing");
  await verifyPassword(await dummyHash, password);
  return false;
}

// Sin caracteres ambiguos (0/O, 1/l/I) para que el admin pueda dictarla.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Contraseña temporal para altas y restablecimientos hechos por un admin. */
export function generateTemporaryPassword(length = 14): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  // Garantiza al menos un dígito para cumplir la política.
  return /\d/.test(out) ? out : out.slice(0, -1) + String(randomInt(2, 10));
}
