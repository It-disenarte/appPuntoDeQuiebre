import { eq } from "drizzle-orm";
import { AppShell } from "@/components/shell/AppShell";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { formatDate } from "@/lib/billing/labels";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export default async function CreatorLayout({ children }: LayoutProps<"/">) {
  const { user, access } = await requireCreatorAccess();
  const notice =
    access.state === "grace"
      ? {
          text: access.graceEndsAt
            ? `No pudimos cobrar tu plan. Actualiza tu pago antes del ${formatDate(access.graceEndsAt)}.`
            : "No pudimos cobrar tu plan. Actualiza tu pago.",
          href: "/suscripcion",
        }
      : undefined;
  const [row] = await db().select({ toursSeen: users.toursSeen }).from(users).where(eq(users.id, user.id)).limit(1);
  return (
    <AppShell userName={user.name} isAdmin={user.role === "admin"} notice={notice} toursSeen={row?.toursSeen ?? []}>
      {children}
    </AppShell>
  );
}
