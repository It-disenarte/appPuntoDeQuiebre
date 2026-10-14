import { getApiUser } from "@/lib/auth/dal";
import { getSetting, SETTING_KEYS, type WelcomeVideo } from "@/lib/settings";
import { getObject, storageConfigured } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Reproduce el video de bienvenida (cualquier usuario con sesión). Soporta Range para iPhone. */
export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) return new Response(null, { status: 401 });
  if (!storageConfigured()) return new Response(null, { status: 404 });

  const video = await getSetting<WelcomeVideo>(SETTING_KEYS.welcomeVideo);
  if (!video?.key) return new Response(null, { status: 404 });

  // Solo un rango simple "bytes=inicio-fin": nada de rangos múltiples.
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader && /^bytes=\d{1,12}-\d{0,12}$/.test(rangeHeader) ? rangeHeader : undefined;

  const obj = await getObject(video.key, range);
  if (!obj) return new Response(null, { status: range ? 416 : 404 });

  const headers = new Headers({
    "Content-Type": obj.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });
  if (obj.contentLength !== undefined) headers.set("Content-Length", String(obj.contentLength));
  if (obj.contentRange) headers.set("Content-Range", obj.contentRange);
  return new Response(obj.body, { status: obj.partial ? 206 : 200, headers });
}
