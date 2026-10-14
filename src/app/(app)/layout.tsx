import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/lib/auth/dal";

export default async function CreatorLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <AppShell userName={user.name} isAdmin={user.role === "admin"}>
      {children}
    </AppShell>
  );
}
