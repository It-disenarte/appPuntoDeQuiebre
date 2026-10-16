import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Chip, FormSuccess, PageHeader } from "@/components/ui";
import { Steps } from "@/components/brujula/Steps";
import { requireCreatorAccess } from "@/lib/auth/gates";
import { getOverview } from "@/lib/brujula/service";
import { lookFromFinal } from "@/lib/kit/look";
import { PIECE_IDS, type PieceId } from "@/lib/kit/schemas";
import { stageUrl } from "@/lib/kit/stage";
import { getHook, getKit, kitStage } from "@/lib/kit/service";
import { MAX_PIECE_ADJUSTMENTS } from "@/lib/kit/schemas";
import { RevealForm, StartReveal } from "./RevealForm";

export const metadata: Metadata = { title: "Revelación del kit" };

export default async function RevelacionPage() {
  const { user } = await requireCreatorAccess();
  const [kit, overview, hook] = await Promise.all([getKit(user.id), getOverview(user.id), getHook(user.id)]);
  const stage = kitStage(kit);
  if (typeof stage === "number" || stage === "fotos") redirect(stageUrl(stage));

  const final = kit.final;
  const approved = Boolean(kit.approvedAt);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Steps overview={overview} current="kit" />
      <PageHeader eyebrow="Último paso" title="Así queda tu kit" />
      {kit.mock && <p className="rounded-xl bg-naranja-100 p-3 text-xs text-ink-900">Versión de prueba: el kit lo armó un generador de reglas, no la IA.</p>}
      <FormSuccess message={approved ? "¡Tu kit está aprobado! Todo lo que hagas en la app se verá así." : undefined} />

      {!final ? (
        <Card className="flex flex-col gap-3">
          <p className="font-extrabold">Listo para armar tu kit con tus fotos</p>
          <p className="text-sm text-ink-600">Vamos a mostrarte 4 portadas con tus colores, tus letras y tus fotos para que las califiques.</p>
          <StartReveal />
        </Card>
      ) : (
        <>
          {!approved && <p className="text-ink-700">Califica cada portada: 👍 si te gusta, 👎 si no. Con 👎 solo ajustamos esa pieza, no todo el kit.</p>}
          <RevealForm
            looks={{ ganchos: lookFromFinal(final, "ganchos"), reflexiones: lookFromFinal(final, "reflexiones") }}
            carousel={{
              foto: { estilo: "foto_con_bloque", fondo: final.carrusel.fondo_portada, tituloColor: final.carrusel.color_titulo_portada, bloque: final.carrusel.color_bloque_foto },
              solida: { estilo: "solida", fondo: final.carrusel.fondo_portada, tituloColor: final.carrusel.color_titulo_portada, bloque: final.carrusel.color_bloque_foto },
            }}
            photos={kit.photos.map((p) => `/api/kit/foto/${p.id}`)}
            hook={hook}
            pieces={Object.fromEntries(PIECE_IDS.map((id) => [id, kit.state.votes?.[id] ?? { voto: "pendiente", ajustes: 0, noUsar: false }])) as Record<PieceId, { voto: "si" | "no" | "pendiente"; ajustes: number; noUsar: boolean }>}
            maxAdjust={MAX_PIECE_ADJUSTMENTS}
          />
          {final.preferencias_visuales.length > 0 && (
            <Card>
              <p className="text-sm font-extrabold">Lo que aprendimos de tu gusto</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-700">
                {final.preferencias_visuales.map((p, i) => (
                  <li key={i}>
                    <Chip tone={p.le_gusta ? "exito" : "neutral"}>{p.le_gusta ? "Te gusta" : "No te gusta"}</Chip> {p.detalle}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
      <Link href="/mi-marca/kit/fotos" className="self-start text-sm font-semibold text-azul underline underline-offset-4">
        Cambiar mis fotos
      </Link>
    </div>
  );
}
