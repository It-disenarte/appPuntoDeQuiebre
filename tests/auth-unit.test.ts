import { describe, expect, it } from "vitest";
import { checkPasswordPolicy } from "@/lib/auth/password-rules";
import { generateTemporaryPassword, hashPassword, verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { generateSessionToken, hashSessionToken, isWellFormedToken } from "@/lib/auth/tokens";
import { clientIpFromForwarded } from "@/lib/request";
import { safeRedirectPath } from "@/lib/safe-redirect";

describe("tokens de sesión", () => {
  it("son únicos, bien formados y su hash es determinista", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(isWellFormedToken(a)).toBe(true);
    expect(hashSessionToken(a)).toBe(hashSessionToken(a));
    expect(hashSessionToken(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(a)).not.toContain(a);
  });
  it("rechaza tokens con formato inválido", () => {
    expect(isWellFormedToken("")).toBe(false);
    expect(isWellFormedToken("x".repeat(44))).toBe(false);
    expect(isWellFormedToken("' OR 1=1 --".padEnd(43, "a"))).toBe(false);
  });
});

describe("contraseñas", () => {
  it("aplica la política", () => {
    expect(checkPasswordPolicy("corta1")).toMatch(/al menos/);
    expect(checkPasswordPolicy("solamenteletras")).toMatch(/número/);
    expect(checkPasswordPolicy("1234567890123")).toMatch(/número|letras/);
    expect(checkPasswordPolicy("anaruiz2026x", "anaruiz@correo.com")).toMatch(/correo/);
    expect(checkPasswordPolicy("Huerto en casa 2026")).toBeNull();
    expect(checkPasswordPolicy("ñandú montaña 7")).toBeNull();
  });
  it("las temporales cumplen la política", () => {
    for (let i = 0; i < 200; i++) expect(checkPasswordPolicy(generateTemporaryPassword())).toBeNull();
  });
  it("hash argon2id y verificación", async () => {
    const h = await hashPassword("Huerto en casa 2026");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "Huerto en casa 2026")).toBe(true);
    expect(await verifyPassword(h, "otra cosa 2026")).toBe(false);
    expect(await verifyPassword("no-es-un-hash", "x")).toBe(false);
    expect(await verifyAgainstDummy("x")).toBe(false);
  });
});

describe("redirecciones seguras", () => {
  it.each([
    ["/semana", "/semana"],
    ["/admin?x=1", "/admin?x=1"],
    ["//evil.com", "/hoy"],
    ["/\\evil.com", "/hoy"],
    ["https://evil.com", "/hoy"],
    ["javascript:alert(1)", "/hoy"],
    ["/ok\nSet-Cookie:x", "/hoy"],
    [undefined, "/hoy"],
    ["/%2F%2Fevil.com", "/hoy"],
    ["/%2f%2fevil.com", "/hoy"],
    ["/%5Cevil.com", "/hoy"],
    ["/semana\\evil", "/hoy"],
    ["/‮/moc.live", "/hoy"],
    ["/ｅvil", "/hoy"],
    ["/semana?dia=2026-10-21&x=%20", "/semana?dia=2026-10-21&x=%20"],
  ])("%s → %s", (input, expected) => {
    expect(safeRedirectPath(input, "/hoy")).toBe(expected);
  });
});

describe("IP del cliente detrás de proxy", () => {
  it("toma el valor agregado por el proxy de confianza, no el del cliente", () => {
    expect(clientIpFromForwarded("1.1.1.1, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(clientIpFromForwarded("1.1.1.1, 203.0.113.9, 10.0.0.2", 2)).toBe("203.0.113.9");
    expect(clientIpFromForwarded("203.0.113.9", 1)).toBe("203.0.113.9");
    expect(clientIpFromForwarded("no-es-ip", 1)).toBeNull();
    expect(clientIpFromForwarded(null, 1)).toBeNull();
  });
});
