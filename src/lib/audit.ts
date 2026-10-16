import "server-only";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.login_blocked"
  | "auth.logout"
  | "auth.password_changed"
  | "auth.registered"
  | "commitment.accepted"
  | "brujula.completed"
  | "brujula.manual_generated"
  | "brujula.manual_approved"
  | "brujula.voice_saved"
  | "brujula.schedule_saved"
  | "brujula.manual_downloaded"
  | "kit.approved"
  | "kit.reset"
  | "billing.checkout_started"
  | "billing.invoice_requested"
  | "admin.password_reset"
  | "admin.user_disabled"
  | "admin.user_enabled"
  | "admin.sessions_revoked"
  | "admin.admin_created"
  | "admin.promo_created"
  | "admin.promo_toggled"
  | "admin.invoice_request_updated"
  | "admin.welcome_video_uploaded";

export async function audit(entry: {
  action: AuditAction;
  actorUserId?: string | null;
  targetUserId?: string | null;
  ip?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db()
      .insert(auditLog)
      .values({
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        targetUserId: entry.targetUserId ?? null,
        ip: entry.ip ?? null,
        meta: entry.meta,
      });
  } catch (err) {
    // La auditoría nunca debe tumbar la acción principal.
    console.error("[audit] no se pudo registrar", entry.action, err);
  }
}
