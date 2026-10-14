// Compartido entre el proxy y el servidor: sin dependencias de Node ni de BD.

export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

/**
 * En producción el prefijo __Host- obliga a Secure, Path=/ y sin Domain,
 * así ningún subdominio puede sobrescribir la cookie.
 */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-pdq_session" : "pdq_session";

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
