import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Sin token: prueba de vida del proceso (siempre 200, no consulta la BD ni revela su estado).
 * Con `Authorization: Bearer <HEALTH_TOKEN>`: además verifica la base de datos (para monitoreo).
 */
export async function GET(request: Request) {
  const expected = env().HEALTH_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !safeEqual(given, expected)) {
    return Response.json({ ok: true }, { headers: NO_STORE });
  }
  try {
    await db().execute(sql`select 1`);
    return Response.json({ ok: true, db: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("[health] base de datos no disponible", err);
    return Response.json({ ok: false, db: false }, { status: 503, headers: NO_STORE });
  }
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
