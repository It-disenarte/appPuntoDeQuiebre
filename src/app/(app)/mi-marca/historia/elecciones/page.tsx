import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { getIntake, getOverview } from "@/lib/brujula/service";
import { QuickForm } from "./QuickForm";

export const metadata: Metadata = { title: "Elecciones rápidas" };

export default async function EleccionesPage() {
  const { user } = await requireCreatorAccess();
  const [intake, overview] = await Promise.all([getIntake(user.id), getOverview(user.id)]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Steps overview={overview} current="historia" />
      <PageHeader eyebrow="Último paso de tu historia" title="Elecciones rápidas" />
      <p className="text-ink-700">Unos toques y listo: con esto armamos tu brújula.</p>
      <QuickForm initial={intake?.quick ?? null} />
      <Link href="/mi-marca/historia" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
        Volver a mi historia
      </Link>
    </div>
  );
}
