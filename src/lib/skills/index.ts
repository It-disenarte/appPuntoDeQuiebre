import "server-only";
import { db } from "@/lib/db";
import { aiCalls } from "@/lib/db/schema";
import { brujulaSkillOutput, mockBrujulaSkill, type BrujulaSkillOutput } from "@/lib/brujula/manual";
import type { Answers } from "@/lib/brujula/content";
import { analyzeVoice, MOCK_TRANSCRIPT, voiceProfileSchema, type VoiceProfile } from "@/lib/brujula/voice";

/**
 * Capa de skills de IA. Hoy todas responden con la versión de PRUEBA (reglas) y respetan el esquema fijo;
 * cuando Mishell entregue las skills reales, se conectan aquí sin tocar las pantallas.
 * Cada llamada queda registrada en ai_calls (costo por usuario).
 */
export const SKILL_VERSIONS = { brujula: "v1-prueba", voz: "v1-prueba" } as const;

async function logCall(userId: string, skill: keyof typeof SKILL_VERSIONS, status: "ok" | "error") {
  await db()
    .insert(aiCalls)
    .values({ userId, skill, skillVersion: SKILL_VERSIONS[skill], mock: true, status, costCents: 0 })
    .catch((err) => console.error("[skills] no se pudo registrar la llamada", err));
}

export async function runBrujulaSkill(userId: string, answers: Answers): Promise<BrujulaSkillOutput> {
  try {
    const out = brujulaSkillOutput.parse(mockBrujulaSkill(answers));
    await logCall(userId, "brujula", "ok");
    return out;
  } catch (err) {
    await logCall(userId, "brujula", "error");
    throw err;
  }
}

/** Transcripción de una grabación. PRUEBA: devuelve un texto fijo hasta conectar el servicio real. */
export async function transcribeAudio(): Promise<{ text: string; mock: true }> {
  return { text: MOCK_TRANSCRIPT, mock: true };
}

export async function runVoiceSkill(userId: string, transcript: string, durationSeconds: number | null): Promise<VoiceProfile> {
  try {
    const out = voiceProfileSchema.parse(analyzeVoice(transcript, durationSeconds));
    await logCall(userId, "voz", "ok");
    return out;
  } catch (err) {
    await logCall(userId, "voz", "error");
    throw err;
  }
}
