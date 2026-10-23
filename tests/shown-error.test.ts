import { describe, expect, it } from "vitest";
import { friendlyError, GENERIC_ERROR } from "@/lib/shown-error";

describe("errores que se muestran a los clientes", () => {
  it("deja pasar los mensajes propios de la app y esconde los técnicos", () => {
    expect(friendlyError("Ya usaste tus 15 imágenes con IA de este mes.")).toBe("Ya usaste tus 15 imágenes con IA de este mes.");
    expect(friendlyError("Falta terminar la historia y las elecciones rápidas")).toBe("Falta terminar la historia y las elecciones rápidas");
    for (const raw of [
      'Anthropic respondió 400: {"type":"error","error":{"message":"Your credit balance is too low"}}',
      "Gemini alcanzó su límite de uso (429). Intenta de nuevo más tarde.",
      "La respuesta no trae JSON (fin: end_turn, 0 caracteres): «»",
      "La salida de brujula no cumple el esquema",
      "Failed query: insert into app_errors",
      "ffmpeg falló: Error opening filters!",
      "connect ECONNREFUSED 10.0.0.5:5432",
      "x".repeat(400),
    ]) {
      expect(friendlyError(raw)).toBe(GENERIC_ERROR);
    }
    expect(friendlyError(null)).toBe(GENERIC_ERROR);
    expect(friendlyError("", "Otro aviso")).toBe("Otro aviso");
  });
});
