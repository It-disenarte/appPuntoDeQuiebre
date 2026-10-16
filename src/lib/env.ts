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
  /** Token opcional para que /api/health verifique también la base de datos (mín. 24 caracteres). */
  HEALTH_TOKEN: optional(z.string().min(24)),
  /** Días que se conserva la bitácora de auditoría (por defecto 365). */
  AUDIT_RETENTION_DAYS: optional(z.coerce.number().int().min(30).max(3650)).default(365),
  TRUSTED_PROXY_HOPS: optional(z.coerce.number().int().min(1).max(5)).default(1),

  // Almacenamiento (MinIO / S3). Opcional en Fase 0.
  S3_ENDPOINT: optional(z.string().url()),
  S3_REGION: optional(z.string()).default("us-east-1"),
  S3_BUCKET: optional(z.string()),
  S3_ACCESS_KEY: optional(z.string()),
  S3_SECRET_KEY: optional(z.string()),

  // Pagos (Stripe). Si faltan, la app funciona pero no permite suscribirse.
  STRIPE_SECRET_KEY: optional(z.string().regex(/^(sk|rk)_(test|live)_/, "debe empezar con sk_test_ / sk_live_")),
  STRIPE_WEBHOOK_SECRET: optional(z.string().startsWith("whsec_")),
  STRIPE_PRICE_BASICO: optional(z.string().startsWith("price_")),
  STRIPE_PRICE_PRO: optional(z.string().startsWith("price_")),
  /** Días de gracia tras un cobro fallido antes de suspender la sesión. */
  BILLING_GRACE_DAYS: optional(z.coerce.number().int().min(0).max(30)).default(7),

  // Skills de IA (fase 2). Sin llave, las skills responden con la versión de prueba.
  ANTHROPIC_API_KEY: optional(z.string().min(20).startsWith("sk-ant-")),
  SKILLS_MODEL: optional(z.string().min(3)).default("claude-sonnet-5-5"),

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
