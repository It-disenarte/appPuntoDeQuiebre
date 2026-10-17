import { BarChart3, Camera, Heart, Images, Smartphone, Users } from "lucide-react";

const STEPS = [
  { Icon: Smartphone, title: "Abre tu perfil en Instagram", text: "Toca tu foto de perfil. Si ves “Panel profesional”, tócalo. (Tu cuenta debe ser profesional o de creador de contenido.)" },
  { Icon: BarChart3, title: "Entra a las estadísticas", text: "En el panel profesional toca “Ver todo” junto a Estadísticas (o “Insights”). Arriba elige el periodo: el mes que vas a reportar o “Últimos 30 días”." },
  { Icon: Camera, title: "Captura la pantalla de resumen", text: "Debe verse el total de vistas y el porcentaje de seguidores contra gente que no te sigue." },
  { Icon: Heart, title: "Captura las interacciones", text: "Entra a “Interacciones”: me gusta, comentarios, guardados y compartidos." },
  { Icon: Users, title: "Captura tus seguidores", text: "Entra a “Seguidores”: cuántos tienes, cuántos ganaste y cuántos dejaron de seguirte. Si tienes 100 o más, también edades y ciudades." },
  { Icon: Images, title: "Captura tu contenido top", text: "En “Contenido que compartiste” deja a la vista tus mejores publicaciones por vistas." },
] as const;

/** Guía paso a paso de dónde buscar las métricas en Instagram. */
export function WhereToFind() {
  return (
    <ol className="flex flex-col gap-3">
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex gap-3 rounded-xl bg-ink-100 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-azul text-blanco" aria-hidden>
            <s.Icon className="size-5" />
          </span>
          <div>
            <p className="font-semibold">
              {i + 1}. {s.title}
            </p>
            <p className="text-sm text-ink-600">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
