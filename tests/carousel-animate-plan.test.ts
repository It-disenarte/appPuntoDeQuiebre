import { beforeEach, describe, expect, it, vi } from "vitest";
import { carruselOutput } from "@/lib/carousel/schemas";

const h = vi.hoisted(() => ({ claude: true, reply: null as unknown, fail: false, calls: [] as { text: string; images: number }[], errors: [] as string[], logs: [] as string[] }));
vi.mock("@/lib/ai/claude", () => ({ claudeConfigured: () => h.claude }));
vi.mock("@/lib/skills", () => ({
  visionJson: async (_system: string, text: string, images: Buffer[]) => {
    h.calls.push({ text, images: images.length });
    if (h.fail) throw new Error("sin JSON");
    return { json: h.reply, inputTokens: 10, outputTokens: 5 };
  },
}));
vi.mock("@/lib/edit/service", () => ({ logCall: async (_u: string, _s: string, _m: boolean, status: string) => void h.logs.push(status) }));
vi.mock("@/lib/errors", () => ({ recordError: async (e: { message: string }) => void h.errors.push(e.message) }));

const slide = (n: number, over: Record<string, unknown> = {}) => ({ n, rol: "punto", plantilla: "texto", titulo: `Punto ${n} con un título`, cuerpo: "Texto de apoyo del punto", icono: "bulb", movimiento: ["icono_rebote"], imagen: { fuente: "ninguna" }, ...over });
const content = carruselOutput.parse({ titulo: "Mi carrusel", tipo: "educativo", slides: [slide(1, { plantilla: "portada_impacto" }), slide(2), slide(3, { plantilla: "cta" })] });
const infos = [1, 2, 3].map((n) => ({ n, present: { icono: true, titulo: true, cuerpo: true } as const, boxes: { icono: { x: 100, y: 200, w: 200, h: 200 } }, hasPhoto: false }));
const previews = [Buffer.from("a"), Buffer.from("b"), Buffer.from("c")];

beforeEach(() => {
  h.claude = true;
  h.fail = false;
  h.reply = null;
  h.calls.length = 0;
  h.errors.length = 0;
  h.logs.length = 0;
});

describe("plan de animación con IA", () => {
  it("usa lo que decide la IA para cada slide, mostrándole todas las imágenes", async () => {
    h.reply = {
      hilo_comun: "Entradas suaves y un zoom solo en los íconos.",
      slides: [
        { n: 1, duracion_s: 6, fondo: { efecto: "acercar", intensidad: "media" }, capas: { icono: { entrada: "zoom", retraso_s: 0.2, duracion_s: 0.7 }, titulo: { entrada: "revelar", retraso_s: 0.8, duracion_s: 1 } }, porque: "La portada entra con fuerza." },
        { n: 2, duracion_s: 5, fondo: { efecto: "quieto", intensidad: "suave" }, capas: { titulo: { entrada: "izquierda", retraso_s: 0.4, duracion_s: 0.6 } }, porque: "Va con calma." },
        { n: 3, capas: {}, porque: "" },
      ],
    };
    const { planAnimations } = await import("@/lib/carousel/animate-plan");
    const r = await planAnimations("u1", content, infos, previews);
    expect(r.ai).toBe(true);
    expect(r.hiloComun).toMatch(/zoom/);
    expect(h.calls[0]!.images).toBe(3);
    expect(h.calls[0]!.text).toContain('"capas":["icono","titulo","cuerpo"]');
    expect(h.logs).toEqual(["ok"]);

    const p1 = r.plans.get(1)!;
    expect(p1.fondo.efecto).toBe("acercar");
    expect(p1.capas.icono!.entrada).toBe("zoom"); // hay caja del ícono
    expect(p1.capas.titulo!.entrada).toBe("revelar");
    expect(p1.porque).toBe("La portada entra con fuerza.");
    expect(r.plans.get(2)!.fondo.efecto).toBe("quieto");
    expect(r.plans.get(2)!.capas.titulo!.entrada).toBe("izquierda");
    expect(r.plans.get(3)!.capas.titulo).toBeDefined(); // lo que la IA no mencionó se anima como siempre
  });

  it("si la IA responde algo que no sirve, se anima con el plan de siempre y queda registrado el motivo", async () => {
    h.reply = { slides: [] };
    const { planAnimations } = await import("@/lib/carousel/animate-plan");
    const r = await planAnimations("u1", content, infos, previews);
    expect(r.ai).toBe(false);
    expect([...r.plans.keys()]).toEqual([1, 2, 3]);
    expect(r.plans.get(2)!.fondo.efecto).toBe("respirar");
    expect(h.logs).toEqual(["error"]);
    expect(h.errors[0]).toMatch(/animacion-carrusel/);
  });

  it("si la IA falla o no hay IA configurada, nunca se queda sin animar", async () => {
    const { planAnimations } = await import("@/lib/carousel/animate-plan");
    h.fail = true;
    expect((await planAnimations("u1", content, infos, previews)).ai).toBe(false);
    h.fail = false;
    h.claude = false;
    const r = await planAnimations("u1", content, infos, previews);
    expect(r.ai).toBe(false);
    expect(h.calls).toHaveLength(1); // solo la del intento que falló; sin IA ni siquiera se llama
    expect(r.plans.get(1)!.capas.icono).toBeDefined();
  });

  it("si la IA pide moverse más lento de lo que se lee, el clip dura al menos lo que tarda en leerse", async () => {
    h.reply = { slides: [{ n: 1, duracion_s: 4, capas: {} }, { n: 2, duracion_s: 4, capas: {} }, { n: 3, duracion_s: 4, capas: {} }] };
    const { planAnimations } = await import("@/lib/carousel/animate-plan");
    const { slideSeconds, slideTexts } = await import("@/lib/carousel/animate");
    const r = await planAnimations("u1", content, infos, previews);
    expect(r.plans.get(1)!.duracion_s).toBeGreaterThanOrEqual(slideSeconds(slideTexts(content.slides[0]!)));
  });
});
