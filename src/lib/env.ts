import "server-only";
import { z } from "zod";

/** Una variable definida pero vacía (FOO=) cuenta como no definida. */
const optional = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v === "" ? undefined : v), t.optional());

/**
 * Variables de entorno del servidor, validadas al primer uso.
 * Nunca importar este archivo desde un componente de cliente.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  /** Conexiones máximas del pool. En local con PGlite debe ser 1 (un solo proceso de BD). */
  DATABASE_POOL_MAX: optional(z.coerce.number().int().min(1).max(50)).default(10),
  /** URL pública de la app, p. ej. https://app.puntodequiebre.mx. Se usa para validar el origen de peticiones. */
  APP_URL: z.string().url(),
  TRUSTED_PROXY_HOPS: optional(z.coerce.number().int().min(1).max(5)).default(1),

  // Almacenamiento (MinIO / S3). Opcional en Fase 0.
  S3_ENDPOINT: optional(z.string().url()),
  S3_REGION: optional(z.string()).default("us-east-1"),
  S3_BUCKET: optional(z.string()),
  S3_ACCESS_KEY: optional(z.string()),
  S3_SECRET_KEY: optional(z.string()),

  // Web Push. Opcional en Fase 0.
  VAPID_PUBLIC_KEY: optional(z.string()),
  VAPID_PRIVATE_KEY: optional(z.string()),
  VAPID_SUBJECT: optional(z.string()),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
