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

  // Gemini: transcripción de audio (fase 2) y, más adelante, calificador de foto y coach de video.
  // Google usa formatos distintos según la antigüedad de la llave ("AIza…" las antiguas, "AQ.…" las nuevas): solo se exige un largo mínimo.
  GEMINI_API_KEY: optional(z.string().min(20)),
  GEMINI_MODEL: optional(z.string().min(3)).default("gemini-2.5-flash"),
  // Skills de texto que se mandan primero a Gemini (más barato) y, si falla, a Claude. Las demás van primero a Claude y, si falla, a Gemini.
  SKILLS_GEMINI: optional(z.string()).default("carruseles,historias,textos,directos,tendencias,perfil"),
  // Modelo de Gemini que crea las imágenes de los carruseles.
  GEMINI_IMAGE_MODEL: optional(z.string().min(3)).default("gemini-2.5-flash-image"),
  // Modelo de Gemini para esas skills (por defecto el mismo de GEMINI_MODEL).
  GEMINI_SKILLS_MODEL: optional(z.string().min(3)),
  // Reservadas para fases siguientes (hoy no se usan): analizador de competencia (5) e Instagram (3).
  APIFY_TOKEN: optional(z.string().min(10)),
  // Actor de Apify que baja las tendencias de TikTok (Creative Center, México), p. ej. "usuario~nombre-del-actor". Sin él se usa una lista de ejemplo.
  APIFY_TRENDS_ACTOR: optional(z.string().regex(/^[A-Za-z0-9_.-]+[~/][A-Za-z0-9_.-]+$/, "usa el formato usuario~actor")),
  /** JSON con la entrada del actor (país, periodo…). Opcional. */
  APIFY_TRENDS_INPUT: optional(z.string().max(2000)),
  META_APP_ID: optional(z.string().min(5)),
  META_APP_SECRET: optional(z.string().min(10)),
  /** Llave para cifrar los tokens de Instagram en la base de datos: 32 bytes en base64 (openssl rand -base64 32). Sin ella no se puede conectar Instagram. */
  TOKEN_ENC_KEY: optional(z.string().regex(/^[A-Za-z0-9+/]{43}=$/, "debe ser 32 bytes en base64 (openssl rand -base64 32)")),

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
