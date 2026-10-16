import "server-only";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { BrujulaV2, HorarioV1, PerfilVozV1 } from "@/lib/skills/schemas";
import { FORMATS, labelOf } from "./content";
import { blockRange, dayLabel } from "./schedule";

const W = 595.28;
const H = 841.89;
const M = 48;

// Colores de la marca Punto de Quiebre (el kit visual del creador llega en la fase 2B).
const AZUL = rgb(0x19 / 255, 0x1b / 255, 0xdf / 255);
const NEGRO = rgb(0x09 / 255, 0x08 / 255, 0x0d / 255);
const NARANJA = rgb(0xfe / 255, 0x68 / 255, 0x07 / 255);
const BLANCO = rgb(1, 1, 1);
const GRIS = rgb(0.4, 0.4, 0.45);

async function loadFont(name: string) {
  return readFile(path.join(process.cwd(), "public", "fonts", name));
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

export type ManualPdfInput = {
  name: string;
  manual: BrujulaV2;
  voice: PerfilVozV1 | null;
  schedule: HorarioV1 | null;
  /** true si el contenido viene de la versión de prueba (sin IA). */
  mock: boolean;
};

/** Genera el PDF de la brújula de marca. Solo dibuja texto (sin HTML ni enlaces). */
export async function buildManualPdf({ name, manual: m, voice, schedule, mock }: ManualPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Brújula de marca · ${name}`);
  pdf.setAuthor("Punto de Quiebre");
  const head = await pdf.embedFont(await loadFont("Anton-Regular.ttf"), { subset: true });
  const body = await pdf.embedFont(await loadFont("Archivo.ttf"), { subset: true });

  const cover = pdf.addPage([W, H]);
  cover.drawRectangle({ x: 0, y: 0, width: W, height: H, color: AZUL });
  cover.drawRectangle({ x: 0, y: 250, width: W, height: 8, color: NARANJA });
  cover.drawText("BRÚJULA", { x: M, y: 440, size: 52, font: head, color: BLANCO });
  cover.drawText("DE MARCA", { x: M, y: 384, size: 52, font: head, color: BLANCO });
  let nmSize = 30;
  const nm = name.toUpperCase();
  while (head.widthOfTextAtSize(nm, nmSize) > W - M * 2 && nmSize > 14) nmSize -= 2;
  cover.drawText(nm, { x: M, y: 300, size: nmSize, font: head, color: NARANJA });
  cover.drawText(m.nicho.principal.slice(0, 80), { x: M, y: 220, size: 12, font: body, color: BLANCO });
  if (mock) cover.drawText("Versión de prueba (sin IA)", { x: M, y: 70, size: 10, font: body, color: BLANCO });
  cover.drawText("Generado con Punto de Quiebre", { x: M, y: 40, size: 9, font: body, color: BLANCO });

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (need: number) => {
    if (y - need < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const h1 = (t: string) => {
    ensure(54);
    y -= 14;
    page.drawRectangle({ x: M, y: y - 4, width: 36, height: 4, color: NARANJA });
    y -= 26;
    page.drawText(t.toUpperCase(), { x: M, y, size: 20, font: head, color: NEGRO });
    y -= 20;
  };
  const para = (t: string, size = 10.5, color = NEGRO, indent = 0) => {
    for (const line of wrap(t, body, size, W - M * 2 - indent)) {
      ensure(size + 6);
      page.drawText(line, { x: M + indent, y, size, font: body, color });
      y -= size + 5;
    }
    y -= 3;
  };
  const label = (t: string) => para(t, 9, GRIS);
  const bullet = (t: string) => {
    wrap(t, body, 10.5, W - M * 2 - 14).forEach((line, i) => {
      ensure(16);
      if (i === 0) page.drawCircle({ x: M + 3, y: y + 3.5, size: 2, color: NARANJA });
      page.drawText(line, { x: M + 14, y, size: 10.5, font: body, color: NEGRO });
      y -= 15.5;
    });
  };

  h1("Nicho y propuesta");
  para(`${m.nicho.principal}. ${m.nicho.enfoque}`);
  label("Propuesta de valor");
  para(m.propuesta_valor);
  label("Frase de marca");
  para(`“${m.frase_de_marca}”`);

  h1("Tu público");
  para(m.publico.descripcion);
  para(`Edad: ${m.publico.rango_edad}`);
  label("Lo que les duele");
  m.publico.dolores.forEach(bullet);
  y -= 6;
  label("Lo que desean");
  m.publico.deseos.forEach(bullet);

  h1("Pilares de contenido");
  m.pilares.forEach((p, i) => {
    ensure(48);
    page.drawText(`${i + 1}. ${p.nombre} · ${p.categoria_dominante}`, { x: M, y, size: 12, font: body, color: AZUL });
    y -= 16;
    para(p.descripcion, 10.5, NEGRO, 14);
    para(`Ideas: ${p.ideas_de_tema.join(" · ")}`, 9.5, GRIS, 14);
  });

  h1("Tono y palabras");
  para(`${m.tono.adjetivos.join(", ")}. ${m.tono.descripcion}`);
  label("Palabras que sí usas");
  para(m.palabras_si.join(", "));
  label("Palabras que evitas");
  para(m.palabras_no.join(", "));

  h1("Postura y visión");
  para(m.postura);
  if (m.puente) para(`Puente: ${m.puente}`);
  para(`Hoy: ${m.vision.hoy}`);
  para(`Después: ${m.vision.despues}`);
  para(`Estilo de grabación: ${labelOf(FORMATS, m.estilo_grabacion.formato_principal)}. ${m.estilo_grabacion.descripcion}`);

  h1("Perfil de voz");
  if (voice) {
    para(`Energía: ${voice.energia}`);
    para(`Ritmo: ${voice.ritmo}`);
    if (voice.palabras_frecuentes.length) para(`Palabras que más usas: ${voice.palabras_frecuentes.join(", ")}.`);
    if (voice.muletillas.length) para(`Muletillas: ${voice.muletillas.map((x) => x.texto).join(", ")}.`);
    label("Reglas para tus guiones");
    voice.reglas_para_guiones.forEach(bullet);
  } else para("Todavía no se genera tu perfil de voz.");

  h1("Horario de grabación");
  if (schedule) {
    schedule.bloques.forEach((b) => bullet(`${b.tipo === "respaldo" ? "Respaldo" : "Fijo"}: ${b.flotante ? "día flotante (lo recuperas otro día)" : `${dayLabel(b.dia)}, ${blockRange(b)}`}`));
    para(`${schedule.horas_semana} horas a la semana. Publicas a las ${schedule.publicar.hora}.`);
  } else para("Todavía no defines tu horario de grabación.");

  const pages = pdf.getPages();
  pages.slice(1).forEach((p, i) => {
    p.drawText(`${name} · Brújula de marca · ${i + 2}/${pages.length}`, { x: M, y: 24, size: 8, font: body, color: GRIS });
  });
  return pdf.save();
}
