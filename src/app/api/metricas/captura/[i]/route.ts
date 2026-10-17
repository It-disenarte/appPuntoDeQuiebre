import { z } from "zod";
import { getApiCreator } from "@/lib/auth/gates";
import { isValidPeriod, readShotBytes } from "@/lib/metrics/service";

export const dynamic = "force-dynamic";

/** Vista previa de una captura ya subida (solo mientras se reúnen las capturas; luego se borran). */
export async function GET(request: Request, { params }: { params: Promise<{ i: string }> }) {
  const user = await getApiCreator();
  if (!user) return new Response("No encontrado", { status: 404 });
  const idx = z.coerce.number().int().min(0).max(20).safeParse((await params).i);
  const period = new URL(request.url).searchParams.get("periodo") ?? "";
  if (!idx.success || !isValidPeriod(period)) return new Response("No encontrado", { status: 404 });
  const shot = await readShotBytes(user.id, period, idx.data);
  if (!shot) return new Response("No encontrado", { status: 404 });
  return new Response(shot.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
