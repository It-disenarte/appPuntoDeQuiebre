"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { submitKeepingState } from "@/lib/form-submit";
import { testPushAction, type NotifyActionState } from "@/lib/notify/actions";

type Status = "cargando" | "no-soportado" | "instalar" | "bloqueado" | "inactivo" | "activo";

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Activa o desactiva los avisos en este dispositivo. El permiso se pide solo al pulsar el botón. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [status, setStatus] = useState<Status>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, testAction, testing] = useActionState<NotifyActionState, FormData>(testPushAction, undefined);

  useEffect(() => {
    (async () => {
      if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhone: solo funciona con la app instalada en la pantalla de inicio.
        const ios = /iphone|ipad/i.test(navigator.userAgent);
        const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
        setStatus(ios && !standalone ? "instalar" : "no-soportado");
        return;
      }
      if (Notification.permission === "denied") return setStatus("bloqueado");
      const reg = await navigator.serviceWorker.ready;
      setStatus((await reg.pushManager.getSubscription()) ? "activo" : "inactivo");
    })().catch(() => setStatus("no-soportado"));
  }, [publicKey]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "bloqueado" : "inactivo");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo activar.");
      setStatus("activo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo activar los avisos.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setStatus("inactivo");
    } finally {
      setBusy(false);
    }
  }

  const info: Partial<Record<Status, string>> = {
    "no-soportado": "Este navegador no permite avisos. Prueba con Chrome, Edge o Safari actualizado.",
    instalar: "En iPhone los avisos funcionan con la app instalada: toca Compartir y luego “Agregar a inicio”. Ábrela desde ahí y vuelve aquí.",
    bloqueado: "Bloqueaste los avisos para esta página. Actívalos en la configuración del navegador y vuelve a intentarlo.",
  };

  return (
    <div className="flex flex-col gap-2">
      {info[status] && <p className="text-sm text-ink-600">{info[status]}</p>}
      {!publicKey && <p className="text-sm text-ink-600">Los avisos todavía no están disponibles en este servidor.</p>}
      {error && (
        <p role="alert" className="rounded-xl bg-alerta-100 px-3 py-2 text-sm font-semibold text-alerta">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {status === "inactivo" && (
          <Button type="button" size="sm" onClick={enable} disabled={busy}>
            {busy ? "Activando…" : "Activar avisos en este dispositivo"}
          </Button>
        )}
        {status === "activo" && (
          <>
            <span className="rounded-full bg-exito-100 px-3 py-1 text-xs font-semibold text-exito">Avisos activados aquí</span>
            <form onSubmit={submitKeepingState(testAction)}>
              <Button type="submit" variant="outline" size="sm" disabled={testing}>
                {testing ? "Enviando…" : "Mandar una prueba"}
              </Button>
            </form>
            <Button type="button" variant="ghost" size="sm" onClick={disable} disabled={busy}>
              Desactivar
            </Button>
          </>
        )}
      </div>
      {test?.ok && <p className="text-sm text-exito">{test.ok}</p>}
      {test?.error && <p className="text-sm text-alerta">{test.error}</p>}
    </div>
  );
}
