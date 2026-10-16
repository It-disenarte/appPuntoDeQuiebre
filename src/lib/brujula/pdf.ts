import "server-only";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { dayLabel, endTime } from "./schedule";
import type { ManualContent } from "./manual";

const W = 595.28;
const H = 841.89;
const M = 48;

const hexColor = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const onColor = (hex: string) => (luminance(hex) > 0.4 ? rgb(0.04, 0.03, 0.05) : rgb(1, 1, 1));

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

/** Genera el PDF del manual de identidad audiovisual con la paleta y el contenido del propio creador. */
export async function buildManualPdf(m: ManualContent, creatorName: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Manual de identidad audiovisual · ${m.identity.displayName || creatorName}`);
  pdf.setAuthor("Punto de Quiebre");
  const head = await pdf.embedFont(await loadFont("Anton-Regular.ttf"), { subset: true });
  const body = await pdf.embedFont(await loadFont("Archivo.ttf"), { subset: true });

  const colors = m.creative.palette.colors;
  const primary = colors[0]!.hex;
  const accent = (colors[2] ?? colors[1] ?? colors[0]!).hex;
  const ink = colors[colors.length - 1]!.hex;
  const paper = (colors[1] ?? colors[0]!).hex;

  // Portada
  const cover = pdf.addPage([W, H]);
  cover.drawRectangle({ x: 0, y: 0, width: W, height: H, color: hexColor(primary) });
  cover.drawRectangle({ x: 0, y: 250, width: W, height: 8, color: hexColor(accent) });
  const coverInk = onColor(primary);
  cover.drawText("MANUAL DE IDENTIDAD", { x: M, y: 420, size: 38, font: head, color: coverInk });
  cover.drawText("AUDIOVISUAL", { x: M, y: 376, size: 38, font: head, color: coverInk });
  const nm = (m.identity.displayName || creatorName).toUpperCase();
  let nmSize = 30;
  while (head.widthOfTextAtSize(nm, nmSize) > W - M * 2 && nmSize > 14) nmSize -= 2;
  cover.drawText(nm, { x: M, y: 300, size: nmSize, font: head, color: hexColor(accent) });
  cover.drawText(`${m.identity.profession} · ${m.identity.niche}`.slice(0, 80), { x: M, y: 220, size: 12, font: body, color: coverInk });
  cover.drawText("Generado con Punto de Quiebre", { x: M, y: 40, size: 9, font: body, color: coverInk });

  // Contenido con salto de página automático
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
    page.drawRectangle({ x: M, y: y - 6, width: 36, height: 4, color: hexColor(accent) });
    y -= 30;
    page.drawText(t.toUpperCase(), { x: M, y, size: 22, font: head, color: hexColor(ink) });
    y -= 20;
  };
  const para = (t: string, size = 10.5, color = hexColor(ink), indent = 0) => {
    for (const line of wrap(t, body, size, W - M * 2 - indent)) {
      ensure(size + 6);
      page.drawText(line, { x: M + indent, y, size, font: body, color });
      y -= size + 5;
    }
    y -= 3;
  };
  const bullet = (t: string) => {
    const lines = wrap(t, body, 10.5, W - M * 2 - 14);
    lines.forEach((line, i) => {
      ensure(16);
      if (i === 0) page.drawCircle({ x: M + 3, y: y + 3.5, size: 2, color: hexColor(accent) });
      page.drawText(line, { x: M + 14, y, size: 10.5, font: body, color: hexColor(ink) });
      y -= 15.5;
    });
  };
  const gap = (n = 14) => {
    y -= n;
  };

  h1("Quién soy");
  para(m.identity.story);
  para(`Ayudo a: ${m.identity.audience}`);
  para(`Problema que resuelvo: ${m.identity.pain}`);
  para(`Objetivo: ${m.identity.goal}. Etapa: ${m.stage.label} (${m.stage.followers.toLocaleString("es-MX")} seguidores).`);

  gap();
  h1("Pilares de contenido");
  m.creative.pillars.forEach((p, i) => {
    ensure(40);
    page.drawText(`${i + 1}. ${p.name}`, { x: M, y, size: 12, font: body, color: hexColor(primary) });
    y -= 16;
    para(p.description, 10.5, hexColor(ink), 14);
  });

  gap();
  h1("Tono de voz");
  para(m.creative.tone.summary);
  para("Haz:", 10.5, hexColor(primary));
  m.creative.tone.do.forEach(bullet);
  gap(6);
  para("Evita:", 10.5, hexColor(primary));
  m.creative.tone.avoid.forEach(bullet);

  gap();
  h1("Paleta de color");
  para(m.creative.palette.name);
  ensure(90);
  const sw = (W - M * 2 - 12 * (colors.length - 1)) / colors.length;
  colors.forEach((c, i) => {
    const x = M + i * (sw + 12);
    page.drawRectangle({ x, y: y - 64, width: sw, height: 64, color: hexColor(c.hex), borderColor: hexColor(paper), borderWidth: 0.5 });
    page.drawText(c.hex.toUpperCase(), { x: x + 6, y: y - 52, size: 9, font: body, color: onColor(c.hex) });
    page.drawText(c.role, { x: x + 6, y: y - 16, size: 9, font: body, color: onColor(c.hex) });
    page.drawText(c.name.slice(0, 18), { x: x + 6, y: y - 78, size: 8.5, font: body, color: hexColor(ink) });
  });
  y -= 96;

  h1("Tipografías");
  para(`Títulos: ${m.creative.typography.headline}`);
  para(`Textos: ${m.creative.typography.body}`);
  para(m.creative.typography.note);

  gap();
  h1("Estilo de grabación");
  m.creative.recording.style.forEach(bullet);
  gap(6);
  para(m.creative.recording.framing);
  if (m.formats.length) para(`Formatos que prefieres: ${m.formats.join(", ")}.`);

  gap();
  h1("Perfil de voz");
  if (m.voice) {
    if (m.voiceIsMock) para("Versión provisional: se calculó con una transcripción de prueba. Se actualizará con tu muestra real.", 9.5, hexColor(primary));
    para(m.voice.summary);
    if (m.voice.vocabulary.length) para(`Vocabulario frecuente: ${m.voice.vocabulary.join(", ")}.`);
  } else {
    para("Todavía no grabas tu muestra de voz. Cuando la hagas, este apartado se completará.");
  }

  gap();
  h1("Horario de grabación");
  if (m.schedule) {
    m.schedule.blocks.forEach((b) =>
      bullet(`${b.kind === "respaldo" ? "Respaldo" : "Bloque"}: ${dayLabel(b.day)}, ${b.start} a ${endTime(b.start, b.minutes)} h`),
    );
    if (m.schedule.lightingAdvice) {
      gap(6);
      para(m.schedule.lightingAdvice);
    }
  } else {
    para("Todavía no defines tu horario de grabación.");
  }

  const pages = pdf.getPages();
  pages.slice(1).forEach((p, i) => {
    p.drawText(`${m.identity.displayName || creatorName} · Manual de identidad audiovisual · ${i + 2}/${pages.length}`, { x: M, y: 24, size: 8, font: body, color: rgb(0.45, 0.45, 0.5) });
  });
  return pdf.save();
}
