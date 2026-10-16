// Manual de identidad audiovisual del creador.
// La parte creativa (pilares, tono, paleta, tipografías, estilo de grabación) la produce la skill "brujula".
// Mientras Mishell entrega la skill real, corre esta versión de PRUEBA con reglas: es determinista y
// respeta el mismo esquema de salida (ver skills/brujula/v1/README.md).
import { z } from "zod";
import { creatorStage, list, optionLabel, STAGE_LABEL, str, type Answers, type Stage } from "./content";
import { proposalSchema, type ScheduleProposal } from "./schedule";
import { voiceProfileSchema, type VoiceProfile } from "./voice";

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** Esquema de salida de la skill "brujula" (acordado con Mishell). */
export const brujulaSkillOutput = z.object({
  pillars: z.array(z.object({ name: z.string().min(2).max(60), description: z.string().min(5).max(240) })).length(3),
  tone: z.object({ summary: z.string().max(400), do: z.array(z.string()).min(2).max(6), avoid: z.array(z.string()).min(2).max(6) }),
  palette: z.object({ name: z.string(), colors: z.array(z.object({ role: z.string(), name: z.string(), hex })).min(3).max(6) }),
  typography: z.object({ headline: z.string(), body: z.string(), note: z.string().max(240) }),
  recording: z.object({ style: z.array(z.string()).min(2).max(6), framing: z.string().max(240) }),
});
export type BrujulaSkillOutput = z.infer<typeof brujulaSkillOutput>;

export const manualContentSchema = z.object({
  complete: z.object({ brujula: z.boolean(), voz: z.boolean(), horario: z.boolean() }),
  identity: z.object({ displayName: z.string(), profession: z.string(), story: z.string(), audience: z.string(), pain: z.string(), niche: z.string(), goal: z.string() }),
  stage: z.object({ id: z.enum(["arranque", "crecimiento", "monetizacion"]), label: z.string(), followers: z.number() }),
  creative: brujulaSkillOutput,
  formats: z.array(z.string()),
  voice: voiceProfileSchema.nullable(),
  voiceIsMock: z.boolean(),
  schedule: proposalSchema.nullable(),
});
export type ManualContent = z.infer<typeof manualContentSchema>;

type Preset = { name: string; colors: { role: string; name: string; hex: string }[]; headline: string; body: string; note: string };

const PRESETS: Record<string, Preset> = {
  tierra: {
    name: "Tierra cálida",
    colors: [
      { role: "Principal", name: "Terracota", hex: "#B5532D" },
      { role: "Secundario", name: "Arena", hex: "#EADBC8" },
      { role: "Acento", name: "Mostaza", hex: "#D8A23A" },
      { role: "Texto", name: "Café oscuro", hex: "#2B1D16" },
    ],
    headline: "Fraunces (títulos)",
    body: "Inter (textos)",
    note: "Una pareja cálida y legible: títulos con carácter y textos limpios.",
  },
  sobrio: {
    name: "Azul sobrio",
    colors: [
      { role: "Principal", name: "Azul marino", hex: "#14365D" },
      { role: "Secundario", name: "Hielo", hex: "#E4ECF5" },
      { role: "Acento", name: "Cian", hex: "#1FA3C4" },
      { role: "Texto", name: "Grafito", hex: "#16202B" },
    ],
    headline: "Montserrat Bold (títulos)",
    body: "Open Sans (textos)",
    note: "Transmite orden y experiencia sin verse frío.",
  },
  pop: {
    name: "Pop eléctrico",
    colors: [
      { role: "Principal", name: "Magenta", hex: "#D6247A" },
      { role: "Secundario", name: "Lila claro", hex: "#F2E6FA" },
      { role: "Acento", name: "Amarillo limón", hex: "#F5E216" },
      { role: "Texto", name: "Negro tinta", hex: "#14101A" },
    ],
    headline: "Bebas Neue (títulos)",
    body: "Poppins (textos)",
    note: "Mucha energía y contraste para destacar en el feed.",
  },
  noche: {
    name: "Noche y oro",
    colors: [
      { role: "Principal", name: "Negro profundo", hex: "#111111" },
      { role: "Secundario", name: "Marfil", hex: "#F4EFE6" },
      { role: "Acento", name: "Oro", hex: "#C9A24B" },
      { role: "Texto", name: "Gris carbón", hex: "#2A2A2A" },
    ],
    headline: "Playfair Display (títulos)",
    body: "Lato (textos)",
    note: "Elegante y sobrio, ideal para marcas premium.",
  },
  amanecer: {
    name: "Amanecer",
    colors: [
      { role: "Principal", name: "Coral", hex: "#E8604C" },
      { role: "Secundario", name: "Durazno", hex: "#FCE3D6" },
      { role: "Acento", name: "Verde salvia", hex: "#6F9C7D" },
      { role: "Texto", name: "Ciruela oscuro", hex: "#2E1A2B" },
    ],
    headline: "Poppins SemiBold (títulos)",
    body: "Nunito (textos)",
    note: "Optimista y humana, funciona para inspirar y acompañar.",
  },
};

const TRAIT_PRESET: Record<string, string> = {
  elegante: "noche",
  cercano: "tierra",
  autentico: "tierra",
  divertido: "pop",
  atrevido: "pop",
  experto: "sobrio",
  directo: "sobrio",
  inspirador: "amanecer",
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

function pillarsFrom(a: Answers): { name: string; description: string }[] {
  const niche = str(a, "nicho", "niche");
  const audience = str(a, "audiencia", "audience");
  const raw = str(a, "nicho", "interests")
    .split(/[\n,;]+/)
    .map(clean)
    .filter((s) => s.length >= 2)
    .map((s) => s.slice(0, 50));
  const topics = [...new Set(raw.map((s) => cap(s)))];
  const out = topics.slice(0, 3).map((t) => ({ name: t, description: `Contenido sobre ${t.toLowerCase()} pensado para ${audience.toLowerCase() || "tu audiencia"}: útil, claro y con tu estilo.` }));
  const fillers = [
    { name: "Mi historia", description: "Tu camino, tus errores y tus aprendizajes. La gente conecta con personas, no con temas." },
    { name: `Errores comunes en ${niche || "tu nicho"}`, description: "Lo que tu audiencia hace mal sin darse cuenta y cómo corregirlo." },
    { name: "Detrás de cámaras", description: "Cómo trabajas en realidad: procesos, herramientas y el día a día." },
  ];
  for (const f of fillers) if (out.length < 3) out.push(f);
  return out;
}

const TONE_TEXT: Record<string, string> = {
  amigo: "Cercano y relajado, como una conversación entre amigos.",
  profesional: "Claro y profesional, con seguridad y sin tecnicismos innecesarios.",
  humor: "Con humor ligero: sonríes primero y enseñas después.",
  energia: "Con energía y motivación: contagias ganas de empezar.",
};

/** Skill "brujula" en modo de PRUEBA (reglas). La versión real la entrega Mishell con el mismo esquema. */
export function mockBrujulaSkill(a: Answers): BrujulaSkillOutput {
  const traits = list(a, "percepcion", "traits");
  const presetId = traits.map((t) => TRAIT_PRESET[t]).find(Boolean) ?? "sobrio";
  const preset = PRESETS[presetId]!;
  const tone = str(a, "percepcion", "tone") || "amigo";
  const avoid = str(a, "percepcion", "avoid");
  const taboo = str(a, "nicho", "taboo");
  const formats = list(a, "formatos", "formats").map((f) => optionLabel("formatos", "formats", f));
  const traitLabels = traits.map((t) => optionLabel("percepcion", "traits", t).toLowerCase());

  return {
    pillars: pillarsFrom(a),
    tone: {
      summary: `${TONE_TEXT[tone]} Quieres que te vean ${traitLabels.join(", ") || "auténtico"}.`,
      do: ["Habla directo a una sola persona", "Empieza con lo más interesante en los primeros 3 segundos", "Usa ejemplos de tu vida real", ...(traitLabels[0] ? [`Mantén tu lado ${traitLabels[0]}`] : [])].slice(0, 5),
      avoid: ["Frases de relleno y rodeos", "Prometer resultados mágicos", ...(avoid ? [`Que digan de ti: ${avoid}`] : []), ...(taboo ? [`Hablar de: ${taboo}`] : [])].slice(0, 5),
    },
    palette: { name: preset.name, colors: preset.colors },
    typography: { headline: preset.headline, body: preset.body, note: preset.note },
    recording: {
      style: [formats.length ? `Formatos favoritos: ${formats.join(", ")}` : "Habla a cámara con encuadre medio", "Videos verticales 9:16, de 30 a 60 segundos", "Gancho, cuerpo y cierre grabados por partes", "Un solo mensaje por video"],
      framing: "Cámara a la altura de los ojos, tu cara en el tercio superior y luz de frente.",
    },
  };
}

export type ManualInput = {
  answers: Answers;
  creative: BrujulaSkillOutput;
  voice: { profile: VoiceProfile; mock: boolean } | null;
  schedule: ScheduleProposal | null;
};

export function assembleManual({ answers, creative, voice, schedule }: ManualInput): ManualContent {
  const followers = Number(str(answers, "objetivo", "followers")) || 0;
  const stage: Stage = creatorStage(followers, str(answers, "objetivo", "hasOffer"));
  return {
    complete: { brujula: true, voz: Boolean(voice), horario: Boolean(schedule) },
    identity: {
      displayName: str(answers, "quien", "displayName"),
      profession: str(answers, "quien", "profession"),
      story: str(answers, "quien", "story"),
      audience: str(answers, "audiencia", "audience"),
      pain: str(answers, "audiencia", "pain"),
      niche: str(answers, "nicho", "niche"),
      goal: optionLabel("objetivo", "goal", str(answers, "objetivo", "goal")),
    },
    stage: { id: stage, label: STAGE_LABEL[stage], followers },
    creative,
    formats: list(answers, "formatos", "formats").map((f) => optionLabel("formatos", "formats", f)),
    voice: voice?.profile ?? null,
    voiceIsMock: voice?.mock ?? false,
    schedule,
  };
}
