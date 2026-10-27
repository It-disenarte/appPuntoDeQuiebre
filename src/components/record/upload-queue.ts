"use client";

/**
 * Cola de subidas guardada en el teléfono (IndexedDB): si se va el internet o se cierra la app, la grabación no se pierde
 * y se sube sola en cuanto se pueda. Cada elemento es una parte de un video.
 */
export type QueueItem = {
  id: string;
  pieceId: string;
  part: string;
  seconds: number;
  mime: string;
  blob: Blob;
  tries: number;
  createdAt: number;
  /** Qué se sube: una parte del video (lo de siempre, también si falta) o la voz en off de la pieza. */
  kind?: "video" | "voz";
};

/** A qué ruta va cada tipo de elemento de la cola. */
export function uploadUrl(item: Pick<QueueItem, "kind" | "pieceId" | "part" | "seconds">): string {
  const piece = encodeURIComponent(item.pieceId);
  return item.kind === "voz" ? `/api/grabaciones/voz?pieza=${piece}&segundos=${item.seconds}` : `/api/grabaciones?pieza=${piece}&parte=${encodeURIComponent(item.part)}&segundos=${item.seconds}`;
}

const DB = "pdq-grabaciones";
const STORE = "subidas";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const queueAvailable = () => typeof indexedDB !== "undefined";
export const queueAll = () => run<QueueItem[]>("readonly", (s) => s.getAll());
export const queuePut = (item: QueueItem) => run("readwrite", (s) => s.put(item));
export const queueDelete = (id: string) => run("readwrite", (s) => s.delete(id));

/** Sube una parte con progreso. Devuelve el error en español, o null si salió bien. */
export function uploadPart(item: QueueItem, onProgress: (pct: number) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl(item));
    xhr.setRequestHeader("Content-Type", item.mime.split(";")[0]!);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(null);
      let msg = "No se pudo subir.";
      try {
        msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
      } catch {}
      // Un error del servidor que no se arregla reintentando se marca con "!" al inicio.
      resolve(xhr.status >= 400 && xhr.status < 500 && xhr.status !== 408 && xhr.status !== 429 ? `!${msg}` : msg);
    };
    xhr.onerror = () => resolve("Sin conexión. Se subirá cuando vuelva el internet.");
    xhr.ontimeout = () => resolve("La conexión es muy lenta. Reintentaremos.");
    xhr.send(item.blob);
  });
}

/** Guarda la voz en off de una pieza en el teléfono. Solo hay una por pieza: la nueva reemplaza a la que estuviera esperando. */
export async function queueVoice(item: QueueItem): Promise<void> {
  for (const old of (await queueAll()).filter((i) => i.kind === "voz" && i.pieceId === item.pieceId)) await queueDelete(old.id);
  await queuePut({ ...item, kind: "voz" });
}

export type DrainEvent = { type: "subiendo" | "esperando"; seconds: number; msg: string } | { type: "subida" } | { type: "rechazada"; msg: string } | { type: "vacia" };

/**
 * Sube las voces en off guardadas de esta pieza. Sin internet (o con un error que se arregla reintentando) se quedan guardadas
 * con un intento más; si el servidor las rechaza y reintentar no lo arregla (el error empieza con "!"), se quitan de la cola.
 */
export async function drainVoice(pieceId: string, on: (e: DrainEvent) => void): Promise<void> {
  const mine = (await queueAll().catch(() => [] as QueueItem[])).filter((i) => i.kind === "voz" && i.pieceId === pieceId).sort((a, b) => a.createdAt - b.createdAt);
  if (mine.length === 0) return on({ type: "vacia" });
  for (const item of mine) {
    on({ type: "subiendo", seconds: item.seconds, msg: "Subiendo…" });
    const err = await uploadPart(item, () => undefined);
    if (!err) {
      await queueDelete(item.id);
      on({ type: "subida" });
    } else if (err.startsWith("!")) {
      await queueDelete(item.id);
      on({ type: "rechazada", msg: err.slice(1) });
    } else {
      await queuePut({ ...item, tries: item.tries + 1 });
      on({ type: "esperando", seconds: item.seconds, msg: err });
    }
  }
}

/** Chrome en Android dice si estás con datos móviles; Safari no lo informa (devuelve false). */
export function onMobileData(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  return c?.type === "cellular" || c?.saveData === true;
}
