"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { invalidateUserSessions } from "@/lib/auth/session";
import { normalizeCode } from "@/lib/billing/promo";
import { createProviderCoupon } from "@/lib/billing/service";
import { billingConfigured } from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import { invoiceRequests, promoCodes, users } from "@/lib/db/schema";
import { getClientIp } from "@/lib/request";
import { saveCommunity } from "@/lib/community";
import { resolveAll, resolveError } from "@/lib/errors";
import { deleteDisabledUser } from "./delete-user";
import { saveLimits, savePrices } from "./limits";
import { listGeminiModels, MODEL_KINDS, testModel, type ModelKind } from "./model-test";
import { saveModels, SKILL_ROUTES } from "./models";

export type AdminState = { error?: string; ok?: boolean; tempPassword?: string; message?: string } | undefined;

const uuid = z.string().uuid();

/* ───────────── Usuarios ───────────── */

/** Asigna una contraseña temporal (se muestra UNA vez al admin) y cierra las sesiones del usuario. */
export async function resetPasswordAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = uuid.safeParse(fd.get("userId"));
  if (!id.success) return { error: "Usuario inválido." };
  if (id.data === admin.id) return { error: "Para tu propia cuenta usa “Cambiar contraseña”." };

  const tempPassword = generateTemporaryPassword();
  const updated = await db()
    .update(users)
    .set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true })
    .where(eq(users.id, id.data))
    .returning({ id: users.id });
  if (updated.length === 0) return { error: "Usuario no encontrado." };
  await invalidateUserSessions(id.data);
  await audit({ action: "admin.password_reset", actorUserId: admin.id, targetUserId: id.data, ip: await getClientIp() });
  return { ok: true, tempPassword };
}

export async function setUserStatusAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = uuid.safeParse(fd.get("userId"));
  const status = fd.get("status");
  if (!id.success || (status !== "active" && status !== "disabled")) return { error: "Datos inválidos." };
  if (id.data === admin.id) return { error: "No puedes desactivar tu propia cuenta." };
  await db().update(users).set({ status }).where(eq(users.id, id.data));
  if (status === "disabled") await invalidateUserSessions(id.data);
  await audit({ action: status === "disabled" ? "admin.user_disabled" : "admin.user_enabled", actorUserId: admin.id, targetUserId: id.data, ip: await getClientIp() });
  revalidatePath(`/admin/clientes/${id.data}`);
  return { ok: true, message: status === "disabled" ? "Cuenta desactivada." : "Cuenta reactivada." };
}

/** Da o quita el plan Pro de cortesía (para probar las funciones Pro o regalarlas). No cambia lo que se cobra. */
export async function setProOverrideAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = uuid.safeParse(fd.get("userId"));
  const on = fd.get("on") === "1";
  if (!id.success) return { error: "Datos inválidos." };
  const updated = await db().update(users).set({ proOverride: on }).where(eq(users.id, id.data)).returning({ id: users.id });
  if (updated.length === 0) return { error: "Usuario no encontrado." };
  await audit({ action: "admin.pro_override", actorUserId: admin.id, targetUserId: id.data, ip: await getClientIp(), meta: { on } });
  revalidatePath(`/admin/clientes/${id.data}`);
  return { ok: true, message: on ? "Pro de cortesía activado." : "Pro de cortesía quitado." };
}

export async function revokeSessionsAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = uuid.safeParse(fd.get("userId"));
  if (!id.success) return { error: "Usuario inválido." };
  if (id.data === admin.id) return { error: "No puedes cerrar tus propias sesiones desde aquí." };
  await invalidateUserSessions(id.data);
  await audit({ action: "admin.sessions_revoked", actorUserId: admin.id, targetUserId: id.data, ip: await getClientIp() });
  return { ok: true, message: "Sesiones cerradas." };
}

const adminSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function createAdminAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const parsed = adminSchema.safeParse({ name: fd.get("name"), email: fd.get("email") });
  if (!parsed.success) return { error: "Revisa el nombre y el correo." };
  const tempPassword = generateTemporaryPassword();
  try {
    const [created] = await db()
      .insert(users)
      .values({ ...parsed.data, passwordHash: await hashPassword(tempPassword), role: "admin", mustChangePassword: true })
      .returning({ id: users.id });
    await audit({ action: "admin.admin_created", actorUserId: admin.id, targetUserId: created!.id, ip: await getClientIp() });
  } catch (err) {
    if ((err as { cause?: { code?: string } }).cause?.code === "23505" || (err as { code?: string }).code === "23505") {
      return { error: "Ya existe una cuenta con ese correo." };
    }
    throw err;
  }
  revalidatePath("/admin/ajustes");
  return { ok: true, tempPassword };
}

/* ───────────── Códigos ───────────── */

const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().min(min).max(max).optional());
// Fechas del formulario (AAAA-MM-DD) en hora de la Ciudad de México (UTC-6 fijo desde 2022).
const optionalDay = (endOfDay: boolean) =>
  z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .transform((d) => new Date(`${d}T${endOfDay ? "23:59:59" : "00:00:00"}-06:00`))
      .optional(),
  );

const promoSchema = z
  .object({
    code: z.string(),
    kind: z.enum(["trial", "discount"]),
    plan: z.enum(["basico", "pro", "any"]),
    trialDays: optionalInt(1, 90),
    percentOff: optionalInt(1, 100),
    durationMonths: optionalInt(1, 24),
    maxUses: optionalInt(1, 100000),
    startsAt: optionalDay(false),
    endsAt: optionalDay(true),
    campaign: z.string().trim().max(80).optional(),
  })
  .refine((d) => (d.kind === "trial" ? d.trialDays !== undefined : d.percentOff !== undefined), {
    message: "Indica los días de prueba o el porcentaje de descuento.",
  })
  .refine((d) => !d.startsAt || !d.endsAt || d.startsAt < d.endsAt, { message: "La vigencia termina antes de empezar." });

export async function createPromoAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const parsed = promoSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los campos." };
  const d = parsed.data;
  const code = normalizeCode(d.code);
  if (!code) return { error: "El código usa de 3 a 40 letras, números, guion o guion bajo." };

  let providerCouponId: string | null = null;
  if (d.kind === "discount") {
    if (!billingConfigured()) return { error: "Para códigos de descuento primero hay que configurar Stripe." };
    providerCouponId = await createProviderCoupon({ code, percentOff: d.percentOff!, durationMonths: d.durationMonths ?? null });
  }

  try {
    await db()
      .insert(promoCodes)
      .values({
        code,
        kind: d.kind,
        plan: d.plan === "any" ? null : d.plan,
        trialDays: d.kind === "trial" ? d.trialDays! : null,
        percentOff: d.kind === "discount" ? d.percentOff! : null,
        durationMonths: d.kind === "discount" ? (d.durationMonths ?? null) : null,
        maxUses: d.maxUses ?? null,
        startsAt: d.startsAt ?? null,
        endsAt: d.endsAt ?? null,
        campaign: d.campaign || null,
        providerCouponId,
        createdBy: admin.id,
      });
  } catch (err) {
    if ((err as { cause?: { code?: string } }).cause?.code === "23505" || (err as { code?: string }).code === "23505") {
      return { error: "Ya existe un código igual." };
    }
    throw err;
  }
  await audit({ action: "admin.promo_created", actorUserId: admin.id, ip: await getClientIp(), meta: { code, kind: d.kind } });
  revalidatePath("/admin/codigos");
  return { ok: true, message: `Código ${code} creado.` };
}

export async function togglePromoAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = uuid.safeParse(fd.get("id"));
  const active = fd.get("active") === "true";
  if (!id.success) return;
  await db().update(promoCodes).set({ active }).where(eq(promoCodes.id, id.data));
  await audit({ action: "admin.promo_toggled", actorUserId: admin.id, ip: await getClientIp(), meta: { id: id.data, active } });
  revalidatePath("/admin/codigos");
}

/* ───────────── Solicitudes de factura ───────────── */

export async function updateInvoiceRequestAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = uuid.safeParse(fd.get("id"));
  const status = fd.get("status");
  const note = String(fd.get("adminNote") ?? "").trim().slice(0, 500);
  if (!id.success || (status !== "emitida" && status !== "rechazada")) return;
  await db()
    .update(invoiceRequests)
    .set({ status, adminNote: note || null, handledBy: admin.id, handledAt: new Date() })
    .where(and(eq(invoiceRequests.id, id.data), ne(invoiceRequests.status, status)));
  await audit({ action: "admin.invoice_request_updated", actorUserId: admin.id, ip: await getClientIp(), meta: { id: id.data, status } });
  revalidatePath("/admin/facturas");
}

/* ───────────── Límites y precios (M10) ───────────── */

const num = (fd: FormData, k: string) => {
  const raw = String(fd.get(k) ?? "").trim().replace(",", ".");
  return raw === "" ? NaN : Number(raw);
};

export async function saveLimitsAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const r = await saveLimits(
    { analyzerIntervalDays: num(fd, "analyzerIntervalDays"), analyzerTopK: num(fd, "analyzerTopK"), coachMonthlyBasico: num(fd, "coachMonthlyBasico"), coachMonthlyPro: num(fd, "coachMonthlyPro"), editsMonthlyPro: num(fd, "editsMonthlyPro"), trendsWeeklyBasico: num(fd, "trendsWeeklyBasico"), trendsWeeklyPro: num(fd, "trendsWeeklyPro"), aiImagesMonthlyBasico: num(fd, "aiImagesMonthlyBasico"), aiImagesMonthlyPro: num(fd, "aiImagesMonthlyPro"), carouselVideosMonthlyPro: num(fd, "carouselVideosMonthlyPro") },
    admin.id,
  );
  if (!r.ok) return { error: r.error };
  await audit({ action: "admin.limits_updated", actorUserId: admin.id, ip: await getClientIp() });
  revalidatePath("/admin/limites");
  return { ok: true, message: "Límites guardados." };
}

export async function savePricesAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const r = await savePrices({ claudeInUsdPerM: num(fd, "claudeInUsdPerM"), claudeOutUsdPerM: num(fd, "claudeOutUsdPerM"), geminiCallUsd: num(fd, "geminiCallUsd"), geminiImageUsd: num(fd, "geminiImageUsd"), apifyRunUsd: num(fd, "apifyRunUsd"), usdMxn: num(fd, "usdMxn") }, admin.id);
  if (!r.ok) return { error: r.error };
  await audit({ action: "admin.prices_updated", actorUserId: admin.id, ip: await getClientIp() });
  revalidatePath("/admin/limites");
  revalidatePath("/admin/metricas");
  return { ok: true, message: "Precios guardados." };
}

/* ───────────── Comunidad ───────────── */

export async function saveCommunityAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const get = (k: string) => String(fd.get(k) ?? "");
  const r = await saveCommunity({ live: get("live"), liveNote: get("liveNote").trim() || null, discord: get("discord"), whatsapp: get("whatsapp") }, admin.id);
  if (!r.ok) return { error: r.error };
  await audit({ action: "admin.community_updated", actorUserId: admin.id, ip: await getClientIp() });
  revalidatePath("/admin/ajustes");
  revalidatePath("/mi-marca");
  return { ok: true, message: "Enlaces guardados." };
}

/* ───────────── Eliminar cuentas desactivadas ───────────── */

export async function deleteUserAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = uuid.safeParse(fd.get("userId"));
  if (!id.success) return { error: "Usuario inválido." };
  if (id.data === admin.id) return { error: "No puedes eliminar tu propia cuenta." };
  const r = await deleteDisabledUser(id.data, String(fd.get("confirmEmail") ?? ""));
  if (!r.ok) return { error: r.error };
  // La bitácora conserva quién lo hizo y el correo eliminado (el vínculo al usuario ya no existe).
  await audit({ action: "admin.user_deleted", actorUserId: admin.id, ip: await getClientIp(), meta: { email: r.email, name: r.name, archivos: r.files } });
  revalidatePath("/admin/clientes");
  redirect("/admin/clientes");
}

/* ───────────── Errores del sistema ───────────── */

export async function resolveErrorAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = uuid.safeParse(fd.get("id"));
  if (id.success) await resolveError(id.data);
  revalidatePath("/admin/errores");
  revalidatePath("/admin");
}
export async function resolveAllErrorsAction(): Promise<void> {
  await requireAdmin();
  await resolveAll();
  revalidatePath("/admin/errores");
  revalidatePath("/admin");
}

/* ───────────── Modelos de IA ───────────── */

export async function saveModelsAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const text = (k: string) => String(fd.get(k) ?? "").trim();
  const r = await saveModels(
    {
      claude: text("claude"),
      geminiText: text("geminiText"),
      geminiMedia: text("geminiMedia"),
      geminiImage: text("geminiImage"),
      geminiImagePro: text("geminiImagePro"),
      routing: Object.fromEntries(SKILL_ROUTES.map((s) => [s.key, text("route_" + s.key) === "gemini" ? "gemini" : "claude"])),
    },
    admin.id,
  );
  if (!r.ok) return { error: r.error };
  await audit({ action: "admin.models_updated", actorUserId: admin.id, ip: await getClientIp() });
  revalidatePath("/admin/modelos");
  return { ok: true, message: "Modelos guardados. Se aplican en unos segundos (también en el worker)." };
}

/** “Probar” junto a un modelo: una llamada mínima para saber si existe y responde. */
export async function testModelAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin();
  const kind = String(fd.get("kind") ?? "") as ModelKind;
  if (!MODEL_KINDS.includes(kind)) return { error: "Modelo no válido." };
  const model = String(fd.get(kind) ?? "").trim();
  if (!model) return { error: "Escribe el nombre del modelo." };
  const r = await testModel(kind, model);
  return r.ok ? { ok: true, message: "✓ " + model + ": " + r.note + " (" + (r.ms / 1000).toFixed(1) + " s)" } : { error: model + ": " + r.error };
}

export type ModelListState = { error?: string; text?: string[]; image?: string[] } | undefined;

/** “Ver los modelos disponibles”: lo que Google deja usar hoy con tu llave. */
export async function listModelsAction(): Promise<ModelListState> {
  await requireAdmin();
  const r = await listGeminiModels();
  return r.ok ? { text: r.text, image: r.image } : { error: r.error };
}
