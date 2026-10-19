import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookie";

/**
 * 1. Content-Security-Policy con nonce por petición (sin 'unsafe-inline' en scripts).
 *    Next.js lee el nonce del encabezado de la petición y lo aplica a sus propios scripts.
 * 2. Comprobación OPTIMISTA de sesión: solo mira si existe la cookie. La validación real
 *    (BD, rol, estado) ocurre en src/lib/auth/dal.ts dentro de cada página y acción.
 */
const PUBLIC_PATHS = ["/login", "/registro", "/terminos", "/privacidad", "/offline", "/api/health", "/api/stripe/webhook"];

export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Estilos en línea: los usan next/font y atributos style de React. Un nonce no cubre atributos.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // data: porque al exportar los PNG (carruseles y portadas) el navegador incrusta las tipografías como datos.
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    // Tras enviar un formulario se puede redirigir a la página de pago o al portal de Stripe.
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  let response: NextResponse;
  if (!token && !isPublic) {
    if (pathname.startsWith("/api/")) {
      response = NextResponse.json({ error: "No autenticado" }, { status: 401 });
    } else {
      const url = new URL("/login", request.url);
      if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
      response = NextResponse.redirect(url);
    }
  } else {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    response = NextResponse.next({ request: { headers: requestHeaders } });
    // Renueva la vigencia de la cookie en peticiones GET (navegaciones y navegación RSC del cliente).
    // No en POST: las Server Actions de login/logout fijan o borran la cookie y no deben competir.
    if (token && request.method === "GET") response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Todo excepto estáticos de Next, el service worker, el manifiesto, archivos con extensión y la
    // subida de video del admin (el proxy guardaría el cuerpo en memoria; esa ruta valida todo sola).
    "/((?!_next/static|_next/image|api/admin/media/|api/grabaciones$|sw\\.js|manifest\\.webmanifest|.*\\.(?:png|svg|ico|jpg|jpeg|webp|woff2?|txt|xml)$).*)",
  ],
};
