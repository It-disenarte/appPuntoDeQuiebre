import { z } from "zod";
import { getApiCreator } from "@/lib/auth/gates";
import { openEdited } from "@/lib/edit/service";

export const dynamic = "force-dynamic";

/** Video editado o su portada (solo su dueña). `?que=portada` para la imagen; `?descargar=1` para bajarlo como archivo. */
export async function GET(request: Request, { params }: { params: Promise<{ pieza: string }> }) {
  const user = await getApiCreator();
  const id = z.string().uuid().safeParse((await params).pieza);
  if (!user || !id.success) return new Response(null, { status: 404 });
  const q = new URL(request.url).searchParams;
  const what = q.get("que") === "portada" ? "portada" : "video";
  const rangeHeader = request.headers.get("range");
  const range = what === "video" && rangeHeader && /^bytes=\d{1,12}-\d{0,12}$/.test(rangeHeader) ? rangeHeader : undefined;
  const obj = await openEdited(user.id, id.data, what, range);
  if (!obj) return new Response(null, { status: range ? 416 : 404 });
  const headers = new Headers({ "Content-Type": what === "video" ? "video/mp4" : "image/png", "Accept-Ranges": what === "video" ? "bytes" : "none", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  if (obj.contentLength !== undefined) headers.set("Content-Length", String(obj.contentLength));
  if (obj.contentRange) headers.set("Content-Range", obj.contentRange);
  if (q.get("descargar") === "1") headers.set("Content-Disposition", `attachment; filename="${what === "video" ? "mi-video-editado.mp4" : "portada.png"}"`);
  return new Response(obj.body, { status: obj.partial ? 206 : 200, headers });
}
