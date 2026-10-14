import "server-only";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.login_blocked"
  | "auth.logout"
  | "auth.password_changed";

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
