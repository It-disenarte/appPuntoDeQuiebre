import { z } from "zod";
import { getApiCreator } from "@/lib/auth/gates";
import { readImage } from "@/lib/carousel/service";

export const dynamic = "force-dynamic";

/** Imagen de un slide (solo su dueña). La versión `?v=` cambia al subir otra, para que el navegador no use la vieja. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const user = await getApiCreator();
  const p = await params;
  const id = z.string().uuid().safeParse(p.id);
  const n = z.coerce.number().int().min(1).max(12).safeParse(p.n);
  if (!user || !id.success || !n.success) return new Response(null, { status: 404 });
  const obj = await readImage(user.id, id.data, n.data);
  if (!obj) return new Response(null, { status: 404 });
  return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
