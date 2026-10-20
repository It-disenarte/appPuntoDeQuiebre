import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveKitFont, ttfNames } from "@/lib/edit/fonts";

describe("tipografías del kit en TTF", () => {
  it("lee el nombre de la fuente de un TTF real", async () => {
    const buf = await readFile(path.join(process.cwd(), "assets", "fonts-ttf", "anton-400.ttf"));
    const n = ttfNames(buf);
    expect(n.full.toLowerCase()).toContain("anton");
  });
  it("elige el archivo según el uso y rechaza fuentes fuera de la lista", async () => {
    const title = await resolveKitFont("poppins", "titulo");
    expect(title.file).toContain("poppins-700");
    const text = await resolveKitFont("Poppins", "texto");
    expect(text.file).toContain("poppins-700");
    const single = await resolveKitFont("DM Serif Display", "titulo");
    expect(single.fullName.toLowerCase()).toContain("dm serif");
    await expect(resolveKitFont("Comic Sans MS", "titulo")).rejects.toThrow(/lista del kit/);
  });
  it("cada familia de la lista del kit tiene su archivo", async () => {
    const { ALL_FONTS } = await import("@/lib/kit/fonts");
    for (const f of ALL_FONTS) {
      const r = await resolveKitFont(f, "titulo");
      expect(r.fullName.length).toBeGreaterThan(2);
    }
  });
});
