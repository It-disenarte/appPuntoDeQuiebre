import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { legacyRedirect, proxy } from "@/proxy";

const env = { LEGACY_HOSTS: "viejo.easypanel.host, otro.ejemplo.com", APP_URL: "https://app.puntodequiebre.pro" };

describe("cambio de dominio: la dirección vieja lleva a la nueva", () => {
  it("manda la misma ruta y los mismos parámetros a la dirección nueva", () => {
    expect(legacyRedirect("viejo.easypanel.host", "/semana/abc?x=1", env)).toBe("https://app.puntodequiebre.pro/semana/abc?x=1");
    expect(legacyRedirect("OTRO.ejemplo.com:443", "/hoy", env)).toBe("https://app.puntodequiebre.pro/hoy");
  });
  it("no toca la dirección nueva ni cualquier otra", () => {
    expect(legacyRedirect("app.puntodequiebre.pro", "/hoy", env)).toBeNull();
    expect(legacyRedirect("localhost:3000", "/hoy", env)).toBeNull();
    expect(legacyRedirect(null, "/hoy", env)).toBeNull();
  });
  it("sin LEGACY_HOSTS o sin APP_URL no redirige nada (no puede mandar a ningún lado)", () => {
    expect(legacyRedirect("viejo.easypanel.host", "/hoy", { APP_URL: env.APP_URL })).toBeNull();
    expect(legacyRedirect("viejo.easypanel.host", "/hoy", { LEGACY_HOSTS: env.LEGACY_HOSTS })).toBeNull();
  });
  it("una ruta con un // no puede sacar a la persona del dominio nuevo", () => {
    for (const path of ["//evil.com/x", "///evil.com", "/\\evil.com", "/@evil.com", "//evil.com@app.puntodequiebre.pro/"]) {
      const to = legacyRedirect("viejo.easypanel.host", path, env);
      expect(to === null || new URL(to).host === "app.puntodequiebre.pro", path).toBe(true);
    }
  });
});

describe("el proxy aplica la redirección (308, que conserva el método)", () => {
  const saved = { l: process.env.LEGACY_HOSTS, a: process.env.APP_URL };
  afterEach(() => {
    process.env.LEGACY_HOSTS = saved.l;
    process.env.APP_URL = saved.a;
  });
  it("desde la dirección vieja", () => {
    process.env.LEGACY_HOSTS = "viejo.easypanel.host";
    process.env.APP_URL = "https://app.puntodequiebre.pro";
    const res = proxy(new NextRequest("https://viejo.easypanel.host/login?next=%2Fhoy", { headers: { "x-forwarded-host": "viejo.easypanel.host" } }));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://app.puntodequiebre.pro/login?next=%2Fhoy");
  });
  it("desde la dirección nueva sigue como siempre (sin sesión, al login)", () => {
    process.env.LEGACY_HOSTS = "viejo.easypanel.host";
    process.env.APP_URL = "https://app.puntodequiebre.pro";
    const res = proxy(new NextRequest("https://app.puntodequiebre.pro/hoy", { headers: { "x-forwarded-host": "app.puntodequiebre.pro" } }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});
