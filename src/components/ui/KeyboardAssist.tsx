"use client";

import { useEffect } from "react";

const TEXTUAL = new Set(["text", "email", "search", "url", "tel", "password", "number", ""]);

/**
 * En Android, al tocar una palabra subrayada en rojo (error de ortografía) en una caja que ya tenía el cursor, a veces se abre
 * solo el menú de correcciones y el teclado no aparece. Si después de tocar una caja de texto el teclado no se ve, se vuelve a
 * enfocar para que se abra. Solo en pantallas táctiles.
 */
export function KeyboardAssist() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const onUp = (e: PointerEvent) => {
      const el = e.target;
      const textual = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXTUAL.has(el.type));
      if (!textual || el.readOnly || el.disabled) return;
      window.setTimeout(() => {
        if (document.activeElement !== el) return;
        const vv = window.visualViewport;
        // Con el teclado abierto, el área visible es bastante menor que la ventana.
        const keyboardHidden = !vv || vv.height > window.innerHeight * 0.85;
        if (keyboardHidden) {
          el.blur();
          el.focus({ preventScroll: true });
        }
      }, 450);
    };
    document.addEventListener("pointerup", onUp, true);
    return () => document.removeEventListener("pointerup", onUp, true);
  }, []);
  return null;
}
