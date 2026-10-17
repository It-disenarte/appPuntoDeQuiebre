# Contexto Fase 8 — Carruseles (skill 8 v2 de Mishell)

Tabla `carousels` (migración 0009, aditiva). Flujo en `/carruseles`: Brief (tema, tipo, objetivo, palabra clave, estilo de imágenes) → 3 ideas (segura/punzante/lateral; "ninguna me convence" máx. 2 veces y luego "escribe la tuya") → entrevista de imágenes si hay IA (la app NO genera imágenes: da prompts para Gemini/ChatGPT) → carrusel de 6–10 slides → edición → subir imágenes → PNG.

- Cuatro modos de la skill (`ideas`, `entrevista_ia`, `carrusel`, `slide`), cada uno con esquema zod tolerante y respuesta de prueba sin IA.
- Rondas de cambios (reglas 33–35): nivel 1 sin IA (texto, diseño, reordenar —la portada siempre primero—, fondo, imagen y encuadre); nivel 2 un slide con nota, máx. 3 intentos; nivel 3 todo el carrusel, máx. 2.
- Vista previa y exportación: `SlideCanvas` (1080×1350, 12 plantillas) con el kit visual del creador; PNG y ZIP se generan en el navegador (`html-to-image` + `fflate`) con las tipografías alojadas en el servidor.
- Imágenes por slide: JPG/PNG/WebP ≤ 8 MB, re-codificadas sin metadatos, en MinIO `carruseles/<usuario>/<id>/`; punto focal ajustable; siguen al slide al reordenar; se borran con el carrusel.
- Entrada desde una pieza tipo carrusel de la parrilla (`/semana/[id]` → "Armar mi carrusel").

Pendiente / decisiones abiertas: carrusel ANIMADO (MP4 con Remotion; Pro) → fase de edición; íconos: la skill pide Tabler y aquí se resuelven a un conjunto de íconos lucide (los desconocidos usan un destello); textura de fondo de IA se sustituye por el color del kit; galería de estilos con imágenes de ejemplo y "sube tu inspo" (visión) aún no; el texto de la publicación (skill 6) no se enlaza al carrusel propio; modo aprendizaje vs. rápido; contraste del texto sobre foto se resuelve con degradado, sin revisar cada foto. Verificación visual de las plantillas pendiente (sin navegador automatizado en esta sesión).
