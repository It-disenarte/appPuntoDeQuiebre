import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookie";

/**
 * Comprobación OPTIMISTA: solo mira si existe la cookie de sesión. La validación real
 * (BD, rol, estado) ocurre en src/lib/auth/dal.ts dentro de cada página y acción.
 */
const PUBLIC_PATHS = ["/login", "/offline", "/api/health"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!token && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  // Renueva la vigencia de la cookie en navegaciones GET (la sesión en BD también se desliza).
  // No en POST: las Server Actions de login/logout fijan o borran la cookie y no deben competir.
  if (token && request.method === "GET") response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}

export const config = {
  matcher: [
    // Todo excepto estáticos de Next, el service worker, el manifiesto y archivos con extensión.
    "/((?!_next/static|_next/image|sw\\.js|manifest\\.webmanifest|.*\\.(?:png|svg|ico|jpg|jpeg|webp|woff2?|txt|xml)$).*)",
  ],
};
