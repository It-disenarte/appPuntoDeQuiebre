import { describe, expect, it } from "vitest";
import { uploadUrl } from "@/components/record/upload-queue";

const piece = "11111111-1111-4111-8111-111111111111";

describe("a dónde sube cada elemento de la cola del teléfono", () => {
  it("la voz en off va a su ruta, con la duración", () => {
    expect(uploadUrl({ kind: "voz", pieceId: piece, part: "voz", seconds: 42 })).toBe(`/api/grabaciones/voz?pieza=${piece}&segundos=42`);
  });
  it("las partes de video siguen yendo a la ruta de siempre", () => {
    expect(uploadUrl({ kind: "video", pieceId: piece, part: "cuerpo", seconds: 30 })).toBe(`/api/grabaciones?pieza=${piece}&parte=cuerpo&segundos=30`);
  });
  it("lo que ya estaba guardado en teléfonos de antes (sin `kind`) sigue siendo video", () => {
    expect(uploadUrl({ pieceId: piece, part: "gancho", seconds: 8 })).toBe(`/api/grabaciones?pieza=${piece}&parte=gancho&segundos=8`);
  });
});
