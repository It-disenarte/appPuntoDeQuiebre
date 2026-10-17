import { getApiCreator } from "@/lib/auth/gates";
import { thumbnailKey } from "@/lib/analyzer/service";
import { getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Miniatura guardada en nuestro almacenamiento (no se enlaza a Instagram porque esas direcciones caducan). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiCreator();
  const { id } = await params;
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("No encontrado", { status: 404 });
  const key = await thumbnailKey(user.id, id);
  const obj = key ? await getObject(key) : null;
  if (!obj) return new Response("No encontrado", { status: 404 });
  return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
