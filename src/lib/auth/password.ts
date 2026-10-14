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

// Hash precalculado (mismos parámetros) de un valor aleatorio descartado. Se verifica contra él
// cuando el correo no existe para igualar el tiempo de respuesta y no revelar qué correos están
// registrados. Es fijo para que tampoco el primer intento cueste distinto.
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$bq0NAsX+YfJue/0gRAM+Sw$0cs1/6D1350QyGv4dAYoSzfIsMiHvvOojhyUCFYXK00";

export async function verifyAgainstDummy(password: string): Promise<false> {
  await verifyPassword(DUMMY_HASH, password);
  return false;
}

// Sin caracteres ambiguos (0/O, 1/l/I) para que el admin pueda dictarla.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Contraseña temporal para altas y restablecimientos hechos por un admin. */
export function generateTemporaryPassword(length = 14): string {
  // Se regenera completa hasta tener letra y dígito (política); casi siempre sale a la primera.
  for (;;) {
    let out = "";
    for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
    if (/\d/.test(out) && /[a-zA-Z]/.test(out)) return out;
  }
}
