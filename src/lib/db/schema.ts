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
