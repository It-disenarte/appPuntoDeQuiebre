import { describe, expect, it } from "vitest";
import { COMMITMENT_SLIDES } from "@/lib/commitment";

describe("textos de la bienvenida", () => {
  it("las palabras que se subrayan existen en su título y el texto es neutro y actualizado", () => {
    for (const s of COMMITMENT_SLIDES) for (const w of s.resalta) expect(s.title.toLowerCase()).toContain(w.toLowerCase());
    const all = COMMITMENT_SLIDES.map((s) => s.title + " " + s.body).join(" ");
    expect(COMMITMENT_SLIDES[0].resalta).toEqual(["sin agencias"]);
    expect(COMMITMENT_SLIDES[1].resalta).toEqual(["resultados"]);
    expect(all).toMatch(/de aprendizaje/);
    expect(all).toMatch(/Lo que necesitas saber/);
    expect(all).toMatch(/de 2 a 4 horas por semana según tu tiempo disponible/);
    expect(all).toMatch(/WhatsApp.*Discord.*equipo Punto de Quiebre.*sí se puede/);
    expect(all).not.toMatch(/siembra|ti mismo|4 a 5 horas/i);
  });
});
