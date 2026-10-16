import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { getOverview } from "@/lib/brujula/service";
import { stageUrl } from "@/lib/kit/stage";
import { getKit, kitStage } from "@/lib/kit/service";
import { PhotoUploader } from "./PhotoUploader";

export const metadata: Metadata = { title: "Fotos del kit" };

export default async function FotosPage() {
  const { user } = await requireCreatorAccess();
  const [kit, overview] = await Promise.all([getKit(user.id), getOverview(user.id)]);
  const stage = kitStage(kit);
  if (typeof stage === "number") redirect(stageUrl(stage));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Steps overview={overview} current="kit" />
      <PageHeader eyebrow="Último paso" title="Tus fotos" />
      <Card className="flex flex-col gap-4">
        <p className="font-semibold">Sube 3 o 4 fotos que subirías normalmente a tu Instagram, salgas o no en ellas.</p>
        <p className="text-sm text-ink-600">Así eliges con qué te identificas. Solo tú las ves, y las usamos para mostrar cómo quedan tus portadas.</p>
        <PhotoUploader photos={kit.photos.map((p) => ({ id: p.id }))} />
      </Card>
      <Link href="/mi-marca/kit" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
        Ver todas las rondas
      </Link>
    </div>
  );
}
