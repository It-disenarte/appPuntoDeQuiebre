import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { MAX_FRAME_BYTES, zipEntryFilter } from "@/lib/carousel/animate";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

describe("ZIP del carrusel animado: no se abre lo que podría tumbar el worker", () => {
  it("un ZIP chico que se expande a cientos de MB se rechaza sin descomprimirlo", () => {
    const bomb = zipSync({ "01_fondo.png": new Uint8Array(MAX_FRAME_BYTES * 20) }, { level: 9 });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    expect(() => unzipSync(bomb, { filter: zipEntryFilter() })).toThrow(/pesa demasiado/);
  });

  it("si la cabecera declara menos de lo real, la salida queda acotada a lo declarado", () => {
    const zip = zipSync({ "01_fondo.png": new Uint8Array(5 * 1024 * 1024) }, { level: 9 });
    const lie = zip.slice();
    const dv = new DataView(lie.buffer);
    for (let i = 0; i < lie.length - 4; i++) {
      if (dv.getUint32(i, true) === 0x04034b50) dv.setUint32(i + 22, 1024, true);
      if (dv.getUint32(i, true) === 0x02014b50) dv.setUint32(i + 24, 1024, true);
    }
    const out = unzipSync(lie, { filter: zipEntryFilter() });
    expect(out["01_fondo.png"]!.length).toBeLessThanOrEqual(1024);
  });

  it("miles de archivos chicos tampoco pasan", () => {
    const many: Record<string, Uint8Array> = {};
    for (let i = 0; i < 500; i++) many[`x${i}.txt`] = png;
    expect(() => unzipSync(zipSync(many), { filter: zipEntryFilter() })).toThrow(/demasiados/);
  });

  it("lo normal pasa y lo que no es una capa se ignora", () => {
    const zip = zipSync({ "01_fondo.png": png, "01_titulo.png": png, "cajas.json": new TextEncoder().encode("{}"), "../../etc/passwd": png, "leeme.txt": png });
    expect(Object.keys(unzipSync(zip, { filter: zipEntryFilter() })).sort()).toEqual(["01_fondo.png", "01_titulo.png", "cajas.json"]);
  });
});
