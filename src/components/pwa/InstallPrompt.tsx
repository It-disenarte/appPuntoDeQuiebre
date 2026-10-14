"use client";

import { Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pdq-install-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Invita a instalar la app en el teléfono. Es necesario para grabar cómodamente
 * y para recibir notificaciones en iPhone (iOS solo las permite con la app instalada).
 */
export function InstallPrompt() {
  const [mode, setMode] = useState<"hidden" | "ios" | "android">("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    if (standalone || !mobile || readDismissed()) return;

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      const t = setTimeout(() => setMode("ios"), 0);
      return () => clearTimeout(t);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setMode("hidden");
  }

  if (mode === "hidden") return null;

  return (
    <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-negro p-4 text-blanco lg:hidden" role="region" aria-label="Instalar la app">
      <div className="flex-1 text-sm leading-snug">
        <p className="font-semibold">Instala la app en tu teléfono</p>
        {mode === "ios" ? (
          <p className="mt-1 text-ink-300">
            Toca <Share className="inline size-4 align-text-bottom" aria-label="Compartir" /> y luego{" "}
            <span className="whitespace-nowrap">
              <SquarePlus className="inline size-4 align-text-bottom" aria-hidden /> “Agregar a inicio”
            </span>
            . Así podrás grabar y recibir recordatorios.
          </p>
        ) : (
          <>
            <p className="mt-1 text-ink-300">Grabas mejor y recibes tus recordatorios.</p>
            <button
              type="button"
              className="tap mt-3 rounded-full bg-naranja px-4 py-2 text-sm font-semibold text-negro"
              onClick={async () => {
                if (!deferred) return;
                await deferred.prompt();
                await deferred.userChoice;
                setDeferred(null);
                setMode("hidden");
              }}
            >
              Instalar
            </button>
          </>
        )}
      </div>
      <button type="button" onClick={dismiss} className="tap -m-1 rounded-full p-1 text-ink-300" aria-label="Cerrar aviso">
        <X className="size-5" />
      </button>
    </div>
  );
}
