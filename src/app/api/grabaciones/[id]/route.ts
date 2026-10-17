import { z } from "zod";
import { getApiCreator } from "@/lib/auth/gates";
import { openRecording } from "@/lib/recording/service";

export const dynamic = "force-dynamic";

/** Reproduce una parte grabada (solo su dueña). Soporta Range para iPhone. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiCreator();
  const id = z.string().uuid().safeParse((await params).id);
  if (!user || !id.success) return new Response(null, { status: 404 });
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader && /^bytes=\d{1,12}-\d{0,12}$/.test(rangeHeader) ? rangeHeader : undefined;
  const obj = await openRecording(user.id, id.data, range);
  if (!obj) return new Response(null, { status: range ? 416 : 404 });
  const headers = new Headers({ "Content-Type": obj.contentType, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  if (obj.contentLength !== undefined) headers.set("Content-Length", String(obj.contentLength));
  if (obj.contentRange) headers.set("Content-Range", obj.contentRange);
  return new Response(obj.body, { status: obj.partial ? 206 : 200, headers });
}
