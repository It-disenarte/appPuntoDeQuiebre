# Contexto — Edición automática Pro (skill 13) con ffmpeg

Decisión (VPS de 2 núcleos y 7.8 GB compartido con otras apps): se usa **ffmpeg + libass**, no Remotion. La IA entrega el mismo plan JSON de la skill 13; un renderizador lo ejecuta (aquí ffmpeg).

- Tablas: `video_edits` (0019) y `recordings.purged_at` (0020), aditivas.
- Alcance construido: modo **a cámara** (cortes, subtítulos con resaltado, planos y acercamientos digitales, textos de gancho/sección/CTA, portada PNG 1080×1920). Pendientes: modo **mixto** (gancho prestado, apoyos, difuminado) y **receta CapCut**.
- Flujo (Pro, 20 al mes configurable): video completo → `edicion.planear` (audio → Gemini con tiempos por palabra → skill 13 con Claude) → revisión del creador (restaurar cortes, editar textos, contestar dudas de transcripción) → `edicion.renderizar` → descargar video y portada. Hasta 3 ajustes con nota (cambian solo lo pedido).
- Sin llaves de IA corre con un plan POR REGLAS (pausas largas, subtítulos de 3 palabras, gancho y CTA, planos alternados), marcado como ejemplo.
- Tipografías del kit en TTF (`assets/fonts-ttf`, `scripts/fetch-kit-ttf.mjs`); nunca otra fuente de respaldo.
- Un solo ciclo del worker para unir y editar videos (uno a la vez, `nice -n 10`, `-threads 1`).
- Retención: partes, video completo y editado se borran a los 30 días (worker diario 4:00).
- Verificado con ffmpeg 9.0.2 real en Windows (`tests/ffmpeg-real.test.ts`, se activa con FFMPEG_BIN/FFPROBE_BIN): unión de partes 3:4/9:16/webm, filtro de edición y portada. NO verificado aún: el binario de Alpine en Docker, voz real con Gemini, plan de Claude real, ni el aspecto final a ojo.
- Hallazgo: `-filter_complex_script` ya no existe en ffmpeg moderno; el filtro va como argumento directo.

## Actualización: modo mixto y receta CapCut
- **Receta CapCut** (`tomas sueltas`): hasta 8 tomas por video (`loose_clips`, 0021), la IA Claude ve fotogramas (cada 2 s, máx. 8 por toma) y entrega los pasos; el código fija el primer paso ("Crea un proyecto 9:16…"), el último ("Exporta en 1080p"), el paso de importar la fuente, ≤10 pasos y la fuente/colores del kit. Descarga de la TTF del kit en `/api/kit/fuente/<familia>`. Sin IA: receta por reglas.
- **Modo mixto** (`video_edits.mode`, 0022): el plan agrega `linea_de_tiempo` (orden final; el gancho prestado repite un pedazo), `privacidad` (difuminar o cortar) y `tramo` en textos/zooms/planos. El render recorre los tiempos por tramo, silencia los apoyos y difumina con `boxblur`. Claude ve un fotograma cada 3 s (máx. 50). Los cortes no se restauran a mano en este modo (se piden con «Pedir un cambio»).
- Verificado con ffmpeg 9 real: línea de tiempo con tramo repetido, apoyo en silencio, difuminado y corte de privacidad. NO verificado: Claude con imágenes real, Gemini con voz real, ni ffmpeg de Alpine.

## Actualización: voz en off (cuarto modo, solo Pro)
- Entrada: `/grabar?pieza=…&modo=vozenoff` (enlace bajo el estudio y cuarta opción del selector). El creador sube hasta **12 tomas** (≤20 s cada una, 1 GB en total; `loose_clips`, las mismas de la receta) y graba su **voz** en la app (teleprompter, selector de micrófono, medidor) o sube un audio (`voiceovers`, 0024; máx. 2 min, 40 MB). Rutas: `POST /api/grabaciones/voz` (excluida del proxy), `GET /api/grabaciones/voz/[pieza]`.
- `video_edits.mode = "voz_en_off"`. `runPlan`/`runRender` de `service.ts` delegan en `voiceover.ts`. Plan: Gemini transcribe la voz; Claude ve ≤3 fotogramas por toma y devuelve `tramos_voz` (qué toma y qué pedazo en cada momento de la voz; instrucciones en `VO_INSTRUCTIONS`, agregadas a la skill 13). El código (`normalizeVoTramos`) obliga cobertura total de la voz sin huecos, tomas que existen y pedazos dentro de su duración. Sin IA: reparte las tomas en partes iguales.
- Render: `buildVoFilterScript` recorta cada tramo a 9:16/30 fps (repite el último cuadro si la toma es corta), concatena sin audio y quema subtítulos/textos; el audio es SOLO la voz. Portada del video ya armado. Al terminar la pieza pasa a "grabado". Retención 30 días (tomas y voz).
- Verificado: reglas, argumentos, flujo con base y mocks. NO verificado aún con ffmpeg real (hay prueba que se activa con FFMPEG_BIN/FFPROBE_BIN), ni con Claude/Gemini reales.
