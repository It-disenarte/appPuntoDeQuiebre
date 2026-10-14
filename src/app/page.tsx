import { redirect } from "next/navigation";
import { getCurrentSession, homeFor } from "@/lib/auth/dal";

export default async function RootPage() {
  const session = await getCurrentSession();
  redirect(session ? homeFor(session.user) : "/login");
}
