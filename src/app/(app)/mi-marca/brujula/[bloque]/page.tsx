import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { BLOCKS, getBlock } from "@/lib/brujula/content";
import { getBrujula, getOverview } from "@/lib/brujula/service";
import { BlockForm } from "../BlockForm";

export const metadata: Metadata = { title: "Brújula" };

export default async function BloquePage({ params }: PageProps<"/mi-marca/brujula/[bloque]">) {
  const { bloque } = await params;
  const block = getBlock(bloque);
  if (!block) notFound();
  const { user } = await requireCreatorAccess();
  const [form, overview] = await Promise.all([getBrujula(user.id), getOverview(user.id)]);
  const idx = BLOCKS.findIndex((b) => b.id === block.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Steps overview={overview} current="brujula" />
      <PageHeader eyebrow={`Bloque ${idx + 1} de ${BLOCKS.length} · ${block.minutes} min`} title={block.title} />
      <p className="text-ink-700">{block.intro}</p>
      <BlockForm key={block.id} block={block} initial={form?.answers[block.id] ?? {}} isLast={idx === BLOCKS.length - 1} />
      <Link href="/mi-marca/brujula" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
        Volver a mi brújula
      </Link>
    </div>
  );
}
