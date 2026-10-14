import { AppShell } from "@/components/shell/AppShell";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { formatDate } from "@/lib/billing/labels";

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
  return (
    <AppShell userName={user.name} isAdmin={user.role === "admin"} notice={notice}>
      {children}
    </AppShell>
  );
}
