import { describe, expect, it } from "vitest";
import { buttonClass, cn } from "@/components/ui";

describe("cn resuelve conflictos de clases", () => {
  it("gana la última clase del mismo tipo, incluidos los colores de marca", () => {
    expect(cn("text-ink-700", "text-blanco")).toBe("text-blanco");
    expect(cn("bg-transparent", "bg-azul")).toBe("bg-azul");
    expect(cn("px-4", "px-2")).toBe("px-2");
    expect(cn("text-sm", "text-blanco")).toBe("text-sm text-blanco");
  });
  it("un className sobrescribe el color de la variante", () => {
    const cls = buttonClass("ghost", "sm", "text-blanco hover:bg-ink-800");
    expect(cls).toContain("text-blanco");
    expect(cls).not.toContain("text-ink-700");
    expect(cls).not.toContain("hover:bg-ink-200/60");
  });
});
