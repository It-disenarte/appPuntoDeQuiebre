import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/** Cifrado AES-256-GCM para secretos guardados en la base de datos (tokens de Instagram). Formato: v1.iv.tag.texto (base64). */
export const encryptionConfigured = () => Boolean(env().TOKEN_ENC_KEY);

const key = () => {
  const k = env().TOKEN_ENC_KEY;
  if (!k) throw new Error("Falta TOKEN_ENC_KEY");
  return Buffer.from(k, "base64");
};

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Formato de secreto no válido");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}
