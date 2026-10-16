import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchesVideoSignature } from "@/lib/video-signature";

const bytes = (s: string) => Uint8Array.from(Buffer.from(s, "latin1"));

describe("firma de video", () => {
  it("acepta MP4/MOV con ftyp y WebM con EBML", () => {
    expect(matchesVideoSignature(bytes("\0\0\0\x18ftypmp42\0\0\0\0"), "video/mp4")).toBe(true);
    expect(matchesVideoSignature(bytes("\0\0\0\x14ftypqt  \0\0\0\0"), "video/quicktime")).toBe(true);
    expect(matchesVideoSignature(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]), "video/webm")).toBe(true);
  });
  it("rechaza SVG/HTML con Content-Type de video y archivos cortos", () => {
    expect(matchesVideoSignature(bytes("<svg xmlns='x'><script>"), "video/mp4")).toBe(false);
    expect(matchesVideoSignature(bytes("<!doctype html>"), "video/webm")).toBe(false);
    expect(matchesVideoSignature(bytes("ftyp"), "video/mp4")).toBe(false);
  });
});

describe("fecha de vigencia de códigos", () => {
  it("la regex del admin acepta fechas ISO", () => {
    const src = readFileSync("src/lib/admin/actions.ts", "utf8");
    expect(src).toContain(String.raw`.regex(/^\d{4}-\d{2}-\d{2}$/)`);
  });
});
