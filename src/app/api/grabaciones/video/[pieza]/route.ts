import { z } from "zod";
import { getApiCreator } from "@/lib/auth/gates";
import { openExport } from "@/lib/recording/join";

export const dynamic = "force-dynamic";

/** Video completo ya armado (solo su dueña). Con `?descargar=1` se baja como archivo; si no, se reproduce (con Range para iPhone). */
export async function GET(request: Request, { params }: { params: Promise<{ pieza: string }> }) {
  const user = await getApiCreator();
  const id = z.string().uuid().safeParse((await params).pieza);
  if (!user || !id.success) return new Response(null, { status: 404 });
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader && /^bytes=\d{1,12}-\d{0,12}$/.test(rangeHeader) ? rangeHeader : undefined;
  const r = await openExport(user.id, id.data, range);
  if (!r) return new Response(null, { status: range ? 416 : 404 });
  const headers = new Headers({ "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  if (r.obj.contentLength !== undefined) headers.set("Content-Length", String(r.obj.contentLength));
  if (r.obj.contentRange) headers.set("Content-Range", r.obj.contentRange);
  if (new URL(request.url).searchParams.get("descargar") === "1") headers.set("Content-Disposition", 'attachment; filename="mi-video.mp4"');
  return new Response(r.obj.body, { status: r.obj.partial ? 206 : 200, headers });
}
