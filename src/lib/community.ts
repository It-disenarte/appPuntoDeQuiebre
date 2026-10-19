import "server-only";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/settings";

/** Enlaces de la comunidad que el administrador configura (sesión en vivo, Discord, WhatsApp). Solo https. */
const url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "El enlace debe empezar con https://")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

export const communitySchema = z.object({ live: url, liveNote: z.string().trim().max(160).nullable().default(null), discord: url, whatsapp: url });
export type Community = z.infer<typeof communitySchema>;

const KEY = "community_links";
export const EMPTY_COMMUNITY: Community = { live: null, liveNote: null, discord: null, whatsapp: null };

export async function getCommunity(): Promise<Community> {
  const r = communitySchema.safeParse((await getSetting<Record<string, unknown>>(KEY)) ?? {});
  return r.success ? r.data : EMPTY_COMMUNITY;
}

export async function saveCommunity(raw: unknown, adminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = communitySchema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Revisa los enlaces." };
  await setSetting(KEY, r.data, adminId);
  return { ok: true };
}

export const hasCommunity = (c: Community) => Boolean(c.live || c.discord || c.whatsapp);
