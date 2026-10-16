import { z } from "zod";
import { getApiCreator } from "@/lib/auth/gates";
import { readPhoto } from "@/lib/kit/service";

export const dynamic = "force-dynamic";

/** Muestra una foto del kit, solo a su dueño. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiCreator();
  if (!user) return new Response("No encontrado", { status: 404 });
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return new Response("No encontrado", { status: 404 });
  const photo = await readPhoto(user.id, id.data);
  if (!photo) return new Response("No encontrado", { status: 404 });
  return new Response(photo.body, {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.size),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
