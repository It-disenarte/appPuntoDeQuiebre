import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";

export type WelcomeVideo = { key: string; contentType: string; size: number; uploadedAt: string };

export const SETTING_KEYS = { welcomeVideo: "welcome_video" } as const;

export async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await db().select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return (row?.value as T | undefined) ?? null;
}

export async function setSetting(key: string, value: Record<string, unknown>, userId: string | null): Promise<void> {
  await db()
    .insert(appSettings)
    .values({ key, value, updatedBy: userId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
}
