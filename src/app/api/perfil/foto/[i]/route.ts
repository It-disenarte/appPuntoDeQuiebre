import { z } from "zod";
import { getApiCreator } from "@/lib/auth/gates";
import { readPhotoByIndex } from "@/lib/profile/service";

export const dynamic = "force-dynamic";

/** Foto de perfil ya calificada (solo su dueña). */
export async function GET(_request: Request, { params }: { params: Promise<{ i: string }> }) {
  const user = await getApiCreator();
  const i = z.coerce.number().int().min(0).max(20).safeParse((await params).i);
  if (!user || !i.success) return new Response(null, { status: 404 });
  const obj = await readPhotoByIndex(user.id, i.data);
  if (!obj) return new Response(null, { status: 404 });
  return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
