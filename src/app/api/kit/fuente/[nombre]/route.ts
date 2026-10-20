import { readFile } from "node:fs/promises";
import path from "node:path";
import { getApiCreator } from "@/lib/auth/gates";
import { ALL_FONTS } from "@/lib/kit/fonts";

export const dynamic = "force-dynamic";

/** Archivo TTF de una tipografía del kit, para importarla en CapCut. Solo familias de la lista cerrada (Google Fonts, licencia OFL). */
export async function GET(request: Request, { params }: { params: Promise<{ nombre: string }> }) {
  const user = await getApiCreator();
  const name = decodeURIComponent((await params).nombre);
  const family = ALL_FONTS.find((f) => f.toLowerCase() === name.toLowerCase());
  if (!user || !family) return new Response(null, { status: 404 });
  const dir = path.join(process.cwd(), "assets", "fonts-ttf");
  const index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8")) as Record<string, Record<string, string>>;
  const weights = Object.keys(index[family] ?? {}).map(Number).sort((a, b) => a - b);
  if (weights.length === 0) return new Response(null, { status: 404 });
  const want = Number(new URL(request.url).searchParams.get("peso"));
  const w = weights.includes(want) ? want : weights.at(-1)!;
  const file = index[family]![String(w)]!;
  const data = await readFile(path.join(dir, file));
  return new Response(new Uint8Array(data), { headers: { "Content-Type": "font/ttf", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
