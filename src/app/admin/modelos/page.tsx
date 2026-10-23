import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getModels, MODEL_SUGGESTIONS, SKILL_ROUTES } from "@/lib/admin/models";
import { listClaudeModels, listGeminiModels } from "@/lib/admin/model-test";
import { requireAdmin } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import { ModelsForm } from "./ModelsForm";

export const metadata: Metadata = { title: "Modelos de IA" };

export default async function ModelosPage() {
  await requireAdmin();
  const [v, claude, gemini] = await Promise.all([getModels(), listClaudeModels(), listGeminiModels()]);
  const e = env();
  // Las listas salen de cada proveedor; si no responden, se usan las sugerencias fijas.
  const suggestions = {
    claude: claude.ok && claude.models.length > 0 ? claude.models : MODEL_SUGGESTIONS.claude,
    gemini: gemini.ok && gemini.text.length > 0 ? gemini.text : MODEL_SUGGESTIONS.gemini,
    image: gemini.ok && gemini.image.length > 0 ? gemini.image : MODEL_SUGGESTIONS.image,
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Configuración" title="Modelos de IA" />
      <p className="text-sm text-ink-600">
        Aquí eliges qué modelo hace cada cosa. Llaves conectadas:{" "}
        <strong>Claude {e.ANTHROPIC_API_KEY ? "sí" : "no"}</strong> · <strong>Gemini {e.GEMINI_API_KEY ? "sí" : "no"}</strong>.
      </p>
      <ModelsForm v={v} skills={SKILL_ROUTES} suggestions={suggestions} />
    </div>
  );
}
