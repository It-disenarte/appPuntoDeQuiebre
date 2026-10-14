import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { env } from "@/lib/env";

export { safeRedirectPath } from "./safe-redirect";

/**
 * IP del cliente. En Easypanel la app está detrás de Traefik, que AGREGA la IP real al final de
 * X-Forwarded-For. Los primeros valores los puede inventar el cliente, así que se cuenta desde la
 * derecha tantos saltos como proxies de confianza haya (TRUSTED_PROXY_HOPS, 1 por defecto;
 * 2 si se pone Cloudflare delante de Traefik).
 */
export async function getClientIp(): Promise<string | null> {
  return clientIpFromForwarded((await headers()).get("x-forwarded-for"), env().TRUSTED_PROXY_HOPS);
}

export function clientIpFromForwarded(xff: string | null, hops: number): string | null {
  if (!xff) return null;
  const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
  const safeHops = Number.isInteger(hops) && hops >= 1 ? hops : 1;
  const candidate = parts[parts.length - safeHops];
  return candidate && isIP(candidate) ? candidate : null;
}

export async function getUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}

