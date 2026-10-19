import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["creator", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "suspended", "disabled"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Siempre en minúsculas y sin espacios (se normaliza en la capa de aplicación). */
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("creator"),
    status: userStatus("status").notNull().default("active"),
    /** true cuando un admin asignó una contraseña temporal: se obliga a cambiarla. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Fecha de nacimiento (verificación de mayoría de edad). Null en cuentas de admin. */
    birthDate: date("birth_date", { mode: "string" }),
    /** Versión de términos y aviso de privacidad aceptada al registrarse. */
    termsVersion: text("terms_version"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    /** Cliente en el proveedor de pagos (Stripe: cus_…). */
    billingCustomerId: text("billing_customer_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
    uniqueIndex("users_billing_customer_idx").on(t.billingCustomerId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 (hex) del token de sesión. El token en claro solo vive en la cookie del usuario. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ip: inet("ip"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

/** Registro de intentos de inicio de sesión para limitar fuerza bruta (por correo y por IP). */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    ip: inet("ip"),
    succeeded: boolean("succeeded").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_email_idx").on(t.email, t.createdAt),
    index("login_attempts_ip_idx").on(t.ip, t.createdAt),
  ],
);

/** Bitácora de acciones sensibles (inicios de sesión, acciones de admin, cambios de contraseña). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    ip: inet("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt), index("audit_log_actor_idx").on(t.actorUserId)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

/* ───────────────────────── Fase 1 · Suscripción, códigos y compromiso ───────────────────────── */

export const planType = pgEnum("plan_type", ["basico", "pro"]);
export const promoKind = pgEnum("promo_kind", ["trial", "discount"]);
export const redemptionStatus = pgEnum("redemption_status", ["reserved", "completed", "released"]);
export const invoiceRequestStatus = pgEnum("invoice_request_status", ["pendiente", "emitida", "rechazada"]);

/** Una suscripción por usuario (la vigente). Se sincroniza desde el proveedor de pagos. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    plan: planType("plan").notNull(),
    /** Estado tal cual lo reporta el proveedor (trialing, active, past_due, canceled, unpaid, …). */
    status: text("status").notNull(),
    trialEnd: timestamp("trial_end", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    /** Desde cuándo está en mora (past_due/unpaid). Inicia el periodo de gracia. */
    pastDueSince: timestamp("past_due_since", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("subscriptions_user_idx").on(t.userId), uniqueIndex("subscriptions_provider_idx").on(t.providerSubscriptionId)],
);

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** En mayúsculas, sin espacios. */
    code: text("code").notNull(),
    kind: promoKind("kind").notNull(),
    /** Plan al que aplica. Null = cualquiera. */
    plan: planType("plan"),
    trialDays: integer("trial_days"),
    percentOff: integer("percent_off"),
    /** Meses que dura el descuento (null = solo el primer cobro). */
    durationMonths: integer("duration_months"),
    maxUses: integer("max_uses"),
    /** Usos reservados + completados. Se actualiza de forma atómica. */
    uses: integer("uses").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    campaign: text("campaign"),
    active: boolean("active").notNull().default(true),
    /** Cupón en el proveedor (solo códigos de descuento). */
    providerCouponId: text("provider_coupon_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("promo_codes_code_idx").on(t.code),
    check("promo_trial_days", sql`${t.kind} <> 'trial' or (${t.trialDays} between 1 and 90)`),
    check("promo_percent", sql`${t.kind} <> 'discount' or (${t.percentOff} between 1 and 100)`),
    check("promo_uses", sql`${t.uses} >= 0 and (${t.maxUses} is null or ${t.uses} <= ${t.maxUses})`),
  ],
);

export const promoRedemptions = pgTable(
  "promo_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeId: uuid("code_id")
      .notNull()
      .references(() => promoCodes.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: redemptionStatus("status").notNull().default("reserved"),
    /** Sesión de pago del proveedor que reservó el uso. */
    checkoutId: text("checkout_id"),
    /** Primer cobro real (> 0) después de usar el código: conversión a pago. */
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("promo_redemptions_code_idx").on(t.codeId),
    index("promo_redemptions_user_idx").on(t.userId),
    uniqueIndex("promo_redemptions_checkout_idx").on(t.checkoutId),
  ],
);

/** Cobros exitosos (facturas pagadas en el proveedor). */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerInvoiceId: text("provider_invoice_id").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    receiptUrl: text("receipt_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payments_provider_idx").on(t.providerInvoiceId), index("payments_user_idx").on(t.userId, t.paidAt)],
);

/** Solicitudes de factura (CFDI). Las emite cuentas por cobrar de Diseñarte. */
export const invoiceRequests = pgTable(
  "invoice_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    rfc: text("rfc").notNull(),
    razonSocial: text("razon_social").notNull(),
    regimenFiscal: text("regimen_fiscal").notNull(),
    codigoPostal: text("codigo_postal").notNull(),
    usoCfdi: text("uso_cfdi").notNull(),
    email: text("email").notNull(),
    notes: text("notes"),
    status: invoiceRequestStatus("status").notNull().default("pendiente"),
    adminNote: text("admin_note"),
    handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("invoice_requests_status_idx").on(t.status, t.createdAt), uniqueIndex("invoice_requests_payment_idx").on(t.paymentId)],
);

/** Aceptación del compromiso (fase 1 del arranque). */
export const commitments = pgTable("commitments", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  contentVersion: text("content_version").notNull(),
  answers: jsonb("answers").$type<Record<string, string>>().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Eventos del proveedor de pagos ya procesados (idempotencia de webhooks). */
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

/** Ajustes editables desde el panel (p. ej. video de bienvenida). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Eventos para límites de frecuencia genéricos (registro, códigos, facturas). */
export const rateEvents = pgTable(
  "rate_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    bucket: text("bucket").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_events_bucket_idx").on(t.bucket, t.createdAt)],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type PromoCode = typeof promoCodes.$inferSelect;
export type Plan = (typeof planType.enumValues)[number];

/* ───────────── Fase 2 · Brújula ───────────── */

/** Registro de cada llamada de IA (y de sus respuestas de prueba) para medir costo por usuario. */
export const aiCalls = pgTable(
  "ai_calls",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    skill: text("skill").notNull(),
    skillVersion: text("skill_version").notNull(),
    mock: boolean("mock").notNull().default(true),
    status: text("status", { enum: ["ok", "error"] }).notNull(),
    costCents: integer("cost_cents").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_calls_user_idx").on(t.userId, t.createdAt)],
);

/** Alta del creador: respuestas de "Tu historia" (7 pasos) y elecciones rápidas. Se guarda texto, nunca audio. */
export const creatorIntake = pgTable("creator_intake", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  story: jsonb("story").$type<unknown>().notNull().default({ steps: {} }),
  quick: jsonb("quick").$type<unknown>(),
  contentVersion: text("content_version").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
});

/** Manual de marca (salida de la skill brujula-v2) con la calificación por secciones. */
export const brandManuals = pgTable("brand_manuals", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  content: jsonb("content").$type<unknown>().notNull(),
  /** { [sección]: { voto, nota, ajustes } } */
  votes: jsonb("votes").$type<unknown>().notNull().default({}),
  status: text("status", { enum: ["borrador", "aprobado"] }).notNull().default("borrador"),
  /** true mientras el contenido venga de la versión de prueba (sin IA). */
  mock: boolean("mock").notNull().default(false),
  skillVersion: text("skill_version").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Perfil de voz (salida de la skill perfil-voz-v1). */
export const voiceProfiles = pgTable("voice_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  content: jsonb("content").$type<unknown>().notNull(),
  mock: boolean("mock").notNull().default(false),
  skillVersion: text("skill_version").notNull(),
  ...timestamps,
});

/** Horario de grabación: respuestas y resultado de horario-v1 (reglas fijas). */
export const schedules = pgTable("schedules", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  answers: jsonb("answers").$type<unknown>().notNull(),
  result: jsonb("result").$type<unknown>().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  ...timestamps,
});

/* ───────────── Fase 2B · Kit visual ───────────── */

/** Estado del juego del kit visual (rondas, elecciones, kit final y calificación de la revelación). */
export const kitVisual = pgTable("kit_visual", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  state: jsonb("state").$type<unknown>().notNull().default({}),
  /** true mientras las opciones vengan de la versión de prueba (sin IA). */
  mock: boolean("mock").notNull().default(false),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
});

/** Fotos que el creador sube para la revelación del kit (se guardan en MinIO, sin metadatos EXIF). */
export const kitPhotos = pgTable(
  "kit_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("kit_photos_user_idx").on(t.userId, t.createdAt)],
);

/* ───────────── Fase 6 · Parrilla semanal ───────────── */

/** Una semana de contenido del creador (de lunes a domingo). */
export const weekPlans = pgTable(
  "week_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    tier: text("tier", { enum: ["basico", "pro"] }).notNull(),
    stage: text("stage", { enum: ["arranque", "crecimiento", "monetizacion"] }).notNull(),
    mix: jsonb("mix").$type<unknown>().notNull(),
    summary: text("summary").notNull().default(""),
    /** Enfoque de las historias de la semana (tarjeta 1C): temas y tipos apagados. */
    focus: jsonb("focus").$type<unknown>().notNull().default({}),
    mock: boolean("mock").notNull().default(false),
    skillVersion: text("skill_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("week_plans_user_week_idx").on(t.userId, t.weekStart)],
);

/** Cada pieza de la parrilla: un video o un carrusel con su guion y sus textos por red. */
export const contentPieces = pgTable(
  "content_pieces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => weekPlans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    n: integer("n").notNull(),
    day: date("day").notNull(),
    publishTime: text("publish_time").notNull(),
    kind: text("kind", { enum: ["video", "carrusel"] }).notNull(),
    category: text("category", { enum: ["viral", "nicho", "conversion"] }).notNull(),
    type: text("type", { enum: ["probado", "prueba"] }).notNull(),
    /** Número `n` de la pieza que esta variante repite con otro gancho o ángulo. */
    variantOfN: integer("variant_of_n"),
    testKind: text("test_kind", { enum: ["gancho", "angulo"] }),
    pillar: text("pillar").notNull(),
    topic: text("topic").notNull(),
    idea: text("idea").notNull().default(""),
    script: jsonb("script").$type<unknown>().notNull(),
    variant: jsonb("variant").$type<unknown>(),
    testCard: text("test_card"),
    /** Salida de la skill de textos y cómo la calificó el creador. */
    texts: jsonb("texts").$type<unknown>(),
    textsReview: jsonb("texts_review").$type<unknown>(),
    status: text("status", { enum: ["pendiente", "grabado", "programado", "publicado", "descartado"] })
      .notNull()
      .default("pendiente"),
    ...timestamps,
  },
  (t) => [uniqueIndex("content_pieces_plan_n_idx").on(t.planId, t.n), index("content_pieces_user_day_idx").on(t.userId, t.day)],
);

/** Una idea de historia por día. */
export const storyIdeas = pgTable(
  "story_ideas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => weekPlans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    data: jsonb("data").$type<unknown>().notNull(),
    /** Qué alternativa se muestra: 0 = la sugerida; 1 en adelante = "otra idea". */
    altIndex: integer("alt_index").notNull().default(0),
    vote: text("vote", { enum: ["no", "mas_o_menos", "si"] }),
    editedText: text("edited_text"),
    ownIdea: text("own_idea"),
    done: boolean("done").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("story_ideas_plan_day_idx").on(t.planId, t.day)],
);

/* ───────────── Fases 5, 10 y 11 · Trabajos, notificaciones, métricas y analizador ───────────── */

/** Cola de trabajos largos (analizador, lectura de capturas). El worker los toma con SKIP LOCKED. */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<unknown>().notNull().default({}),
    status: text("status", { enum: ["pendiente", "corriendo", "lista", "error"] }).notNull().default("pendiente"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(2),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("jobs_pick_idx").on(t.status, t.runAfter), index("jobs_user_kind_idx").on(t.userId, t.kind, t.createdAt)],
);

/** Suscripciones de Web Push (una por navegador o teléfono). */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    failures: integer("failures").notNull().default(0),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_endpoint_idx").on(t.endpoint), index("push_user_idx").on(t.userId)],
);

/** Registro de notificaciones: la clave (usuario, tipo, referencia) evita enviar dos veces lo mismo. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    refKey: text("ref_key").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url").notNull(),
    status: text("status", { enum: ["pendiente", "enviada", "fallida", "omitida"] }).notNull().default("pendiente"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notifications_dedupe_idx").on(t.userId, t.kind, t.refKey), index("notifications_user_idx").on(t.userId, t.createdAt)],
);

/** Preferencias del creador: modo pausa y avisos. */
export const creatorSettings = pgTable("creator_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** El modo pausa congela la racha y silencia los avisos hasta esta fecha (máximo 7 días). */
  pauseUntil: date("pause_until"),
  pauseStartedAt: timestamp("pause_started_at", { withTimezone: true }),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  ...timestamps,
});

/** Informe mensual de métricas leído de las capturas de pantalla del creador. */
export const metricReports = pgTable(
  "metric_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Mes que se reporta, AAAA-MM. */
    period: text("period").notNull(),
    /** captura (subiendo imágenes) → procesando (leyendo) → revision (el creador confirma sus cifras) → lista (con explicación). */
    status: text("status", { enum: ["captura", "procesando", "revision", "lista", "error"] }).notNull().default("captura"),
    shots: integer("shots").notNull().default(0),
    /** Llaves en MinIO de las capturas; se borran al terminar de leerlas. */
    shotKeys: jsonb("shot_keys").$type<unknown>().notNull().default([]),
    extracted: jsonb("extracted").$type<unknown>(),
    confirmed: jsonb("confirmed").$type<unknown>(),
    explanation: jsonb("explanation").$type<unknown>(),
    mock: boolean("mock").notNull().default(false),
    error: text("error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("metric_reports_user_period_idx").on(t.userId, t.period)],
);

/** Cuentas que el creador quiere estudiar: sus referentes del alta y las que agregue. */
export const competitors = pgTable(
  "competitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    source: text("source", { enum: ["referente", "manual"] }).notNull().default("manual"),
    followers: integer("followers"),
    reels30d: integer("reels_30d"),
    avgViews30d: integer("avg_views_30d"),
    lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("competitors_user_name_idx").on(t.userId, t.username)],
);

/** Una corrida del analizador de competencia (1 cada 7 días). */
export const analyzerRuns = pgTable(
  "analyzer_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["en_cola", "corriendo", "lista", "error"] }).notNull().default("en_cola"),
    params: jsonb("params").$type<unknown>().notNull(),
    progress: jsonb("progress").$type<unknown>().notNull().default({}),
    summary: jsonb("summary").$type<unknown>(),
    mock: boolean("mock").notNull().default(false),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("analyzer_runs_user_idx").on(t.userId, t.createdAt), uniqueIndex("analyzer_runs_one_active_idx").on(t.userId).where(sql`${t.status} in ('en_cola', 'corriendo')`)],
);

/** Cada video de la competencia ya analizado, con los conceptos nuevos adaptados al creador. */
export const analyzedVideos = pgTable(
  "analyzed_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => analyzerRuns.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creator: text("creator").notNull(),
    link: text("link").notNull(),
    thumbnailKey: text("thumbnail_key"),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    datePosted: date("date_posted"),
    analysis: jsonb("analysis").$type<unknown>().notNull(),
    concepts: jsonb("concepts").$type<unknown>().notNull(),
    starred: boolean("starred").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("analyzed_videos_run_idx").on(t.runId), index("analyzed_videos_user_idx").on(t.userId, t.views)],
);

/** Una parte grabada de un video (gancho, cuerpo o cierre). Regrabar reemplaza la anterior. */
export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pieceId: uuid("piece_id")
      .notNull()
      .references(() => contentPieces.id, { onDelete: "cascade" }),
    part: text("part", { enum: ["gancho", "cuerpo", "cierre"] }).notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    seconds: integer("seconds").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("recordings_piece_part_idx").on(t.pieceId, t.part), index("recordings_user_idx").on(t.userId)],
);

/** Un carrusel de Instagram armado paso a paso (skill 8). Las imágenes viven en MinIO; aquí solo sus llaves. */
export const carousels = pgTable(
  "carousels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pieceId: uuid("piece_id").references(() => contentPieces.id, { onDelete: "set null" }),
    number: integer("number").notNull().default(1),
    brief: jsonb("brief").$type<unknown>().notNull(),
    /** Rondas de ideas ya mostradas: [{ items, note }] (no se borran al pedir otras). */
    ideas: jsonb("ideas").$type<unknown>().notNull().default([]),
    chosen: jsonb("chosen").$type<unknown>(),
    interview: jsonb("interview").$type<unknown>(),
    answers: jsonb("answers").$type<unknown>(),
    content: jsonb("content").$type<unknown>(),
    /** Intentos por slide ({ "3": 1 }) y veces que se rehízo todo. */
    slideAttempts: jsonb("slide_attempts").$type<unknown>().notNull().default({}),
    fullRedos: integer("full_redos").notNull().default(0),
    /** { "3": { key, focalX, focalY } } */
    images: jsonb("images").$type<unknown>().notNull().default({}),
    background: text("background"),
    mock: boolean("mock").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("carousels_user_idx").on(t.userId, t.createdAt)],
);

/** Optimización del perfil de Instagram (skill 4) y calificación de la foto de perfil (skill 5). Una fila por creador. */
export const profileOpt = pgTable(
  "profile_opt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Lo que el creador escribió de su perfil hoy (no se lee de Instagram hasta tener la API). */
    current: jsonb("current").$type<unknown>(),
    result: jsonb("result").$type<unknown>(),
    /** Rondas extra de nombre y biografía: { nombre: [{ options, note }], biografia: [...] } */
    extra: jsonb("extra").$type<unknown>().notNull().default({}),
    votes: jsonb("votes").$type<unknown>().notNull().default({}),
    /** Lo que eligió o editó el creador: { nombre, biografia } */
    chosen: jsonb("chosen").$type<unknown>().notNull().default({}),
    /** Partes que ya aplicó en Instagram: { nombre: true, ... } */
    applied: jsonb("applied").$type<unknown>().notNull().default({}),
    /** Veces que pidió otras opciones: { nombre: 1, biografia: 0 } */
    refreshes: jsonb("refreshes").$type<unknown>().notNull().default({}),
    /** Fotos calificadas, de la más vieja a la más nueva: [{ key, at, result, mock }] */
    photos: jsonb("photos").$type<unknown>().notNull().default([]),
    mock: boolean("mock").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("profile_opt_user_idx").on(t.userId)],
);

/** Revisión de El Lente (coach de video, skill 11) de un video grabado. numero 0 = el creador dijo "así lo publico". */
export const coachReviews = pgTable(
  "coach_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pieceId: uuid("piece_id")
      .notNull()
      .references(() => contentPieces.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    status: text("status", { enum: ["procesando", "lista", "error", "omitida"] }).notNull().default("procesando"),
    result: jsonb("result").$type<unknown>(),
    /** Calificación de cada mejora: { "0": { voto: "si" | "no", nota } } */
    votes: jsonb("votes").$type<unknown>().notNull().default({}),
    mock: boolean("mock").notNull().default(false),
    error: text("error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("coach_reviews_piece_num_idx").on(t.pieceId, t.numero), index("coach_reviews_user_idx").on(t.userId, t.createdAt)],
);

/** Respuestas del creador sobre sus directos (skill 15) y la recomendación que se le dio. Una fila por creador. */
export const liveProfile = pgTable(
  "live_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    situacion: text("situacion", { enum: ["hace", "quiere_hacer", "no_quiere"] }),
    plataformas: jsonb("plataformas").$type<unknown>().notNull().default([]),
    dias: jsonb("dias").$type<unknown>().notNull().default([]),
    hora: text("hora"),
    frecuencia: text("frecuencia"),
    compromiso: text("compromiso"),
    recomendacion: jsonb("recomendacion").$type<unknown>(),
    /** Veces seguidas que dijo "Ahora no" al aviso mensual; con 3 ya no se le muestra. */
    avisosNoSeguidos: integer("avisos_no_seguidos").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("live_profile_user_idx").on(t.userId)],
);

/** Guía de directos de una semana (o una de apoyo). `done` marca los directos que ya hizo ({ "2026-10-20": true }). */
export const liveGuides = pgTable(
  "live_guides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["semanal", "apoyo"] }).notNull(),
    weekStart: date("week_start"),
    result: jsonb("result").$type<unknown>().notNull(),
    done: jsonb("done").$type<unknown>().notNull().default({}),
    mock: boolean("mock").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("live_guides_user_idx").on(t.userId, t.createdAt)],
);

/** Lista diaria de tendencias (compartida por todos los creadores). */
export const trendLists = pgTable(
  "trend_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    day: date("day").notNull(),
    items: jsonb("items").$type<unknown>().notNull(),
    /** "apify" = viene del actor configurado; "muestra" = lista de ejemplo mientras no hay actor. */
    source: text("source", { enum: ["apify", "muestra"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("trend_lists_day_idx").on(t.day)],
);

/** Un uso de “Ver tendencias” de un creador (cuenta contra su límite semanal; los refresh no cuentan). */
export const trendUses = pgTable(
  "trend_uses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    /** Rondas de ideas: [{ ideas, note }] (no se borran al pedir otras). */
    rounds: jsonb("rounds").$type<unknown>().notNull().default([]),
    refreshes: integer("refreshes").notNull().default(0),
    mock: boolean("mock").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("trend_uses_user_idx").on(t.userId, t.weekStart)],
);

/** Tendencias que el creador ya usó (no se le repiten). */
export const trendsUsed = pgTable(
  "trends_used",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trendId: text("trend_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("trends_used_user_trend_idx").on(t.userId, t.trendId)],
);

/** Cuenta de Instagram conectada con el inicio de sesión oficial de Instagram. El token vive cifrado. */
export const igConnections = pgTable(
  "ig_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    igUserId: text("ig_user_id").notNull(),
    username: text("username").notNull(),
    name: text("name"),
    accountType: text("account_type"),
    tokenEnc: text("token_enc").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    scopes: text("scopes").notNull().default(""),
    /** { followers, follows, mediaCount } de la última sincronización. */
    profile: jsonb("profile").$type<unknown>().notNull().default({}),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("ig_connections_user_idx").on(t.userId), uniqueIndex("ig_connections_ig_idx").on(t.igUserId)],
);

/** Publicaciones recientes de la cuenta conectada con sus métricas. */
export const igMedia = pgTable(
  "ig_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    igMediaId: text("ig_media_id").notNull(),
    mediaType: text("media_type").notNull(),
    permalink: text("permalink"),
    caption: text("caption"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    metrics: jsonb("metrics").$type<unknown>().notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ig_media_user_media_idx").on(t.userId, t.igMediaId), index("ig_media_user_posted_idx").on(t.userId, t.postedAt)],
);

/** Auditoría inicial de la cuenta conectada (skill 0) y las respuestas del creador a sus tarjetas "Así te vemos". */
export const accountAudits = pgTable(
  "account_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    result: jsonb("result").$type<unknown>().notNull(),
    /** { t1: { voto: "si" | "no" | "ajustar", nota } } */
    votes: jsonb("votes").$type<unknown>().notNull().default({}),
    mock: boolean("mock").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("account_audits_user_idx").on(t.userId)],
);

/** Video completo armado con las 3 partes grabadas (gancho, cuerpo y cierre), listo para descargar o publicar. */
export const videoExports = pgTable(
  "video_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pieceId: uuid("piece_id")
      .notNull()
      .references(() => contentPieces.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["procesando", "lista", "error"] }).notNull().default("procesando"),
    objectKey: text("object_key"),
    bytes: integer("bytes"),
    seconds: integer("seconds"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("video_exports_piece_idx").on(t.pieceId)],
);
