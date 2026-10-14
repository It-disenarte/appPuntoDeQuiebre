"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const SECTIONS = [
  { label: "Resumen", href: "/admin" },
  { label: "Clientes", href: "/admin/clientes" },
  { label: "Suscripciones", href: "/admin/suscripciones" },
  { label: "Códigos", href: "/admin/codigos" },
  { label: "Facturas", href: "/admin/facturas" },
  { label: "Ajustes", href: "/admin/ajustes" },
] as const;

const UPCOMING = [{ label: "Métricas del negocio", phase: 7 }] as const;

export function AdminNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Secciones de administración" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:mt-8 lg:flex-col lg:px-0">
      {SECTIONS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={isActive(s.href) ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold",
            isActive(s.href) ? "bg-azul text-blanco" : "text-ink-300 hover:bg-ink-800 hover:text-blanco",
          )}
        >
          {s.label}
        </Link>
      ))}
      {UPCOMING.map((s) => (
        <span key={s.label} className="flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-500" aria-disabled>
          {s.label}
          <span className="text-[0.625rem] font-semibold uppercase">Fase {s.phase}</span>
        </span>
      ))}
    </nav>
  );
}
