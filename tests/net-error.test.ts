import { describe, expect, it } from "vitest";
import { errorText } from "@/lib/net-error";

describe("errorText (fallos de subida en español)", () => {
  it("la red caída se muestra en español, no el mensaje en inglés del navegador", () => {
    for (const m of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "Network request failed"]) {
      expect(errorText(new TypeError(m), "x")).toMatch(/^Sin conexión/);
    }
  });
  it("lo que mandó el servidor pasa tal cual", () => {
    expect(errorText(new Error("El carrusel animado es del plan Pro."), "x")).toBe("El carrusel animado es del plan Pro.");
  });
  it("un error de programación no se disfraza de falta de internet", () => {
    expect(errorText(new TypeError("Cannot read properties of undefined (reading 'x')"), "x")).toMatch(/Cannot read/);
  });
  it("sin error útil, usa el texto de respaldo", () => {
    expect(errorText("algo", "No se pudo subir.")).toBe("No se pudo subir.");
    expect(errorText(new Error(""), "No se pudo subir.")).toBe("No se pudo subir.");
  });
});
