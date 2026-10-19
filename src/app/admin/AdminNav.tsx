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
  { label: "Métricas", href: "/admin/metricas" },
  { label: "Alertas", href: "/admin/alertas" },
  { label: "Errores", href: "/admin/errores" },
  { label: "Límites y costos", href: "/admin/limites" },
  { label: "Ajustes", href: "/admin/ajustes" },
] as const;

export function AdminNav({ errors }: { errors: { open: number; repeating: number } }) {
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
          {s.href === "/admin/errores" && errors.open > 0 && (
            <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold", errors.repeating > 0 ? "bg-alerta text-blanco" : "bg-naranja text-negro")} aria-label={`${errors.open} errores sin atender`}>
              {errors.open}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
