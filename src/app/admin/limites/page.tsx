import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getLimits, getPrices } from "@/lib/admin/limits";
import { requireAdmin } from "@/lib/auth/dal";
import { LimitsForm, PricesForm } from "./LimitsForms";

export const metadata: Metadata = { title: "Límites y costos" };

export default async function LimitesPage() {
  await requireAdmin();
  const [limits, prices] = await Promise.all([getLimits(), getPrices()]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Configuración" title="Límites y costos" />
      <LimitsForm v={limits} />
      <PricesForm v={prices} />
    </div>
  );
}
