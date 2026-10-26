"use server";

import { revalidatePath } from "next/cache";
import { queueBg } from "@/lib/bg";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { HOUR, rateLimit } from "@/lib/rate";
import { forgetLearning, LEARNING_SCOPE } from "./service";

/** “Actualizar lo que aprendí”: lo corre el worker; sin suficientes piezas no gasta IA. */
export async function runLearningAction(): Promise<void> {
  const { user } = await requireCreatorAccess();
  if (!(await rateLimit(`aprendizaje:user:${user.id}`, 6, HOUR))) return;
  await queueBg(user.id, LEARNING_SCOPE, "aprendizaje");
  revalidatePath("/progreso");
}

/** “Olvidar lo aprendido”: vuelve a empezar de cero (se puede revertir cuando quiera). */
export async function forgetLearningAction(): Promise<void> {
  const { user } = await requireCreatorAccess();
  await forgetLearning(user.id);
  revalidatePath("/progreso");
}
