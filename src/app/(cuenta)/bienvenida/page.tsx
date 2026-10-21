import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { hasAcceptedCommitment, requirePaidUser } from "@/lib/auth/gates";
import { COMMITMENT_SLIDES } from "@/lib/commitment";
import { getSetting, SETTING_KEYS, type WelcomeVideo } from "@/lib/settings";
import { Welcome } from "./CommitmentForm";

export const metadata: Metadata = { title: "Bienvenida" };

export default async function BienvenidaPage() {
  const { user } = await requirePaidUser();
  if (user.role !== "admin" && (await hasAcceptedCommitment(user.id))) redirect("/hoy");
  const video = await getSetting<WelcomeVideo>(SETTING_KEYS.welcomeVideo);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader eyebrow={`Te damos la bienvenida, ${user.name.split(" ")[0]}`} title="Antes de empezar" />
      <Welcome slides={COMMITMENT_SLIDES.map((s) => ({ ...s }))} hasVideo={Boolean(video)} />
    </div>
  );
}
