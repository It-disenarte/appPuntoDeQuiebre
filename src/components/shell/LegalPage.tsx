import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { TERMS_VERSION } from "@/lib/legal";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pt-safe min-h-dvh bg-ink-100">
      <header className="bg-azul px-6 py-6">
        <Link href="/" aria-label="Inicio">
          <Logo surface="azul" className="w-36" />
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-4xl">{title}</h1>
        <p className="mt-2 rounded-xl bg-naranja-100 px-4 py-3 text-sm text-ink-900">
          Borrador pendiente de revisión legal · versión {TERMS_VERSION}. El texto definitivo lo entrega el abogado antes del lanzamiento.
        </p>
        <div className="mt-8 flex flex-col gap-4 leading-relaxed text-ink-800 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-extrabold">{children}</div>
      </main>
    </div>
  );
}
