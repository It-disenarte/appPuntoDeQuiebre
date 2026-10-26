import { describe, expect, it } from "vitest";
import { momentFor, PHRASES, phraseFor } from "@/lib/motivation";

describe("frases motivacionales", () => {
  it("elige el momento según lo que pasa hoy", () => {
    const base = { dow: 2, streak: 0, missedRecently: false, recordsToday: false, publishesToday: false };
    expect(momentFor({ ...base, publishesToday: true })).toBe("publicar");
    expect(momentFor({ ...base, recordsToday: true })).toBe("grabar");
    expect(momentFor({ ...base, streak: 3 })).toBe("racha");
    expect(momentFor({ ...base, missedRecently: true })).toBe("recupera");
    expect(momentFor({ ...base, dow: 0 })).toBe("arranque");
    expect(momentFor(base)).toBe("constancia");
  });

  it("la frase de un día no cambia al recargar y hay variedad entre días", () => {
    expect(phraseFor("constancia", "2026-10-26")).toBe(phraseFor("constancia", "2026-10-26"));
    const days = Array.from({ length: 30 }, (_, i) => phraseFor("constancia", `2026-11-${String(i + 1).padStart(2, "0")}`));
    expect(new Set(days).size).toBeGreaterThan(5);
  });

  it("el banco cuida el tono: sin promesas, sin género marcado y de largo razonable", () => {
    const all = Object.values(PHRASES).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const f of all) {
      expect(f.length).toBeLessThanOrEqual(110);
      expect(f).not.toMatch(/viral|vender|ganar dinero|garantiz|seguro que|éxito|exitos/i);
      expect(f).not.toMatch(/\b(orgullos[ao]|capaz|valiente|bienvenid[ao]|segur[ao] de ti)\b/i);
    }
  });
});
