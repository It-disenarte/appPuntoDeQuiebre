import { createHash, randomBytes } from "node:crypto";

/** Token de sesión opaco: 256 bits aleatorios en base64url. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** El identificador guardado en BD es el SHA-256 del token: una fuga de la BD no permite suplantar sesiones. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Formato esperado del token (43 caracteres base64url). Evita consultas con basura. */
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
