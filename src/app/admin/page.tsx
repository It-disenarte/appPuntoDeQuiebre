import { count, desc, eq, gt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { auditLog, sessions, users } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Administrador" };

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Inicio de sesión",
  "auth.login_failed": "Intento fallido",
  "auth.login_blocked": "Bloqueado por intentos",
  "auth.logout": "Cierre de sesión",
  "auth.password_changed": "Cambio de contraseña",
  "cli.create_admin": "Alta de admin (consola)",
  "cli.reset_password": "Contraseña restablecida (consola)",
  "worker.cleanup": "Limpieza automática",
};

const targetUser = alias(users, "target_user");

const dateFmt = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });

export default async function AdminHome() {
  await requireAdmin();
  const database = db();
  const [[creators], [admins], [active], events] = await Promise.all([
    database.select({ n: count() }).from(users).where(eq(users.role, "creator")),
    database.select({ n: count() }).from(users).where(eq(users.role, "admin")),
    database.select({ n: count() }).from(sessions).where(gt(sessions.expiresAt, new Date())),
    database
      .select({
        id: auditLog.id,
        action: auditLog.action,
        createdAt: auditLog.createdAt,
        // Quién hizo la acción o, si no hay actor (p. ej. intento fallido), a quién afectó.
        email: sql<string | null>`coalesce(${users.email}, ${targetUser.email})`,
        ip: auditLog.ip,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.actorUserId, users.id))
      .leftJoin(targetUser, eq(auditLog.targetUserId, targetUser.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(15),
  ]);

  const tiles = [
    { label: "Creadores", value: creators?.n ?? 0 },
    { label: "Administradores", value: admins?.n ?? 0 },
    { label: "Sesiones activas", value: active?.n ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Panel de administrador" title="Resumen" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <p className="text-xs text-ink-500">{t.label}</p>
            <p className="font-display mt-2 text-4xl">{t.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-0">
        <h2 className="px-5 pt-5 text-sm font-extrabold">Actividad de seguridad reciente</h2>
        {events.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-500">Sin eventos todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[32rem] text-left text-sm">
              <thead className="text-xs text-ink-500">
                <tr>
                  <th className="px-5 py-2 font-semibold">Evento</th>
                  <th className="px-5 py-2 font-semibold">Usuario</th>
                  <th className="px-5 py-2 font-semibold">IP</th>
                  <th className="px-5 py-2 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="px-5 py-3">{ACTION_LABEL[e.action] ?? e.action}</td>
                    <td className="px-5 py-3 text-ink-600">{e.email ?? "—"}</td>
                    <td className="px-5 py-3 text-ink-600">{e.ip ?? "—"}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-ink-600">{dateFmt.format(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
