# Contexto Fase 7 — Grabación

Tabla nueva `recordings` (migración 0008, aditiva). Una fila por (pieza, parte: gancho|cuerpo|cierre); regrabar reemplaza y borra el archivo anterior de MinIO.

- `/grabar`: lista de videos por grabar; `/grabar?pieza=<id>` abre el estudio (cámara frontal, guía de encuadre, teleprompter con 5 velocidades que termina al tiempo estimado, cuenta de 3, grabar/detener, ver la toma, repetir o usar).
- Compresión: MediaRecorder a 2.5 Mbps video / 128 kbps audio, 720x1280 ideal.
- Cola de subidas en el teléfono (IndexedDB): sobrevive a cortes de internet y cierres; reintenta cada 30 s y al volver `online`. Errores 4xx definitivos descartan el elemento con mensaje.
- Aviso de datos móviles: solo donde el navegador lo informa (`navigator.connection`, Chrome Android). Safari/iPhone no lo expone: sube sin avisar.
- `POST /api/grabaciones` está excluida del proxy (como el video de bienvenida): valida sesión, dueña de la pieza, origen, tipo por firma de bytes, tope 250 MB y 180 s, y limita 60 subidas/hora.
- Con las 3 partes la pieza pasa a `grabado`; al borrar una vuelve a `pendiente`.

Pendiente / a auditar: probar en dispositivos reales; unir las partes en un solo video (hoy se guardan separadas; la edición/unión llega con la fase de edición); archivos huérfanos en MinIO si se borra una pieza (cascada de BD no borra objetos).
