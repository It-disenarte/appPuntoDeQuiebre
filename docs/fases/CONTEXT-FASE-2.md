# CONTEXT · Fase 2 — Brújula de marca

Documento para la IA que audita. Describe qué se construyó, cómo, y dónde buscar errores o vulnerabilidades.
Fase anterior: [CONTEXT-FASE-1.md](CONTEXT-FASE-1.md). Especificación de origen: "Luis — Guía de desarrollo de la app", Fase 2 y Bloque 2.

## 1. Alcance

El creador (con pago y compromiso aceptado) completa su **brújula de marca** y obtiene su **manual de identidad audiovisual**:

1. **Formulario por bloques** (6 bloques cortos: quién eres, a quién ayudas, cómo quieres ser percibido, nicho e intereses, objetivo, formatos y referentes). Se guarda por bloque; se puede pausar y continuar.
2. **Muestra de voz**: grabación en el teléfono (2 a 4 min) o texto escrito (≥150 palabras). Produce un **perfil de voz** (vocabulario, muletillas, ritmo, largo de frase). El audio **no se conserva**.
3. **Horario**: 5 preguntas de opción múltiple → propuesta de 2 bloques de grabación + 1 de respaldo con el porqué y consejo de luz (aro de luz si graba de noche sin luz). El usuario acepta o ajusta.
4. **Manual de identidad** visible en la app y **descargable en PDF** (pilares, tono, perfil de voz, paleta, tipografías, estilo de grabación, horario).
5. **Skills de IA con respuestas de prueba**: la guía indica que las skills las escribe Mishell y que Luis deja el espacio con respuestas de prueba. Hay una capa de skills con esquema JSON fijo, versión y registro de costo (`ai_calls`). **No hay llamadas reales a IA en esta fase.**
6. Integración: tarjeta "tu brújula" en Hoy y datos reales en Mi marca.

Fuera de alcance (fases siguientes): Instagram, optimización de perfil, analizador, parrilla, grabación de guiones, recordatorios (Web Push) y la alerta de "10 días sin terminar la brújula" (Fase 10).

## 2. Decisiones y desviaciones

| Decisión | Por qué |
| --- | --- |
| **Transcripción de audio de PRUEBA**: devuelve un texto fijo (`MOCK_TRANSCRIPT`) y el perfil queda marcado `mock = true` ("Versión de prueba" en pantalla y PDF). | No hay servicio de transcripción conectado (Gemini). Se evita inventar un perfil a partir de un audio que no se leyó, y se avisa al usuario. |
| **Alternativa "Prefiero escribir"** con análisis real por reglas. | Da un perfil real hoy y es accesible si no se puede grabar. El ritmo (palabras/min) solo se mide con audio. |
| El **horario es lógica de reglas, no IA**. | Rápido, gratis y predecible; así lo describe la guía (reglas del motor sin gastar IA). |
| El audio se guarda en MinIO **solo durante la transcripción** y se borra en `finally`. | Misma política que los videos ("se borran del servidor después de analizarse"). Si no hay MinIO configurado, se procesa sin guardar. |
| Las fases **no se bloquean entre sí**: el manual se arma con la brújula completa y se completa solo cuando llegan voz y horario. | La guía: "solo se bloquea lo que depende de una fase anterior". |
| Tipografías de la paleta (Fraunces, Montserrat…) son **recomendaciones en texto**; el PDF usa Anton y Archivo (OFL) de `public/fonts/`. | No se incrustan fuentes del creador; el PDF sigue la identidad de la app. |
| Textos del formulario, opciones, paletas y etapas son **propuestas editables** (`BRUJULA_VERSION`). | Pendiente de validar con Erick y Mishell. |

## 3. Modelo de datos (migración `0002_fase2_brujula.sql`)

| Tabla | Contenido |
| --- | --- |
| `brujulas` | PK `user_id`. `answers` jsonb por bloque, `completed_blocks text[]`, `content_version`, `completed_at`. |
| `voice_samples` | PK `user_id` (una por usuario; regrabar la reemplaza). `topic`, `source` (`audio`/`texto`), `transcript`, `duration_seconds`, `profile` jsonb, `mock`, `skill_version`. **Sin columna de audio.** |
| `schedules` | PK `user_id`. `answers`, `proposal` jsonb, `adjusted`, `accepted_at`. |
| `brand_manuals` | PK `user_id`. `content` jsonb (validado con zod al leer y al escribir), `skill_version`, `generated_at`. |
| `ai_calls` | Registro por llamada de skill: `skill`, `skill_version`, `mock`, `status`, `cost_cents`, tokens. Índice `(user_id, created_at)`. |

Todas con `ON DELETE CASCADE` desde `users` (`ai_calls` con `SET NULL`). Los jsonb se **validan con zod al leerlos**: un registro dañado se trata como inexistente, no rompe la pantalla.

## 4. Rutas y autorización

| Ruta | Tipo | Autorización |
| --- | --- | --- |
| `/mi-marca/brujula`, `/mi-marca/brujula/[bloque]`, `/mi-marca/voz`, `/mi-marca/horario`, `/mi-marca/manual` | Páginas | `requireCreatorAccess()` (sesión + pago/gracia + compromiso; admin pasa). `[bloque]` desconocido → 404. |
| `saveBlockAction`, `saveVoiceTextAction`, `saveScheduleAnswersAction`, `acceptScheduleAction`, `adjustScheduleAction` | Server Actions | `requireCreatorAccess()`; operan siempre sobre `user.id` de la sesión (nunca un id recibido). |
| `POST /api/voz?tema=&segundos=` | Route Handler | `isSameOrigin` + `getApiCreator()` (acceso pagado + compromiso) + límite 8/h por usuario. |
| `GET /api/manual/pdf` | Route Handler | `getApiCreator()` + límite 20/h; solo devuelve el manual del propio usuario. `Cache-Control: private, no-store`. |

`getApiCreator()` (en `src/lib/auth/gates.ts`) es la versión sin redirecciones de `requireCreatorAccess` para Route Handlers.

## 5. Flujos sensibles

### 5.1 Subida de audio (`/api/voz`)
1. Valida origen, sesión con acceso, límite de frecuencia, tema (lista cerrada) y duración declarada (90 a 255 s).
2. Exige `Content-Type` en lista cerrada (`webm`, `ogg`, `mp4`/`m4a`, `mpeg`), `Content-Length` presente y ≤ 8 MB, y **firma de los primeros bytes** (`matchesAudioSignature`), igual que el video de Fase 1.
3. Guarda en `voz/<userId>/<uuid>.<ext>` (si hay MinIO), transcribe (prueba), calcula el perfil, guarda texto y perfil, reconstruye el manual y **borra el audio en `finally`**.
4. La duración la informa el cliente; se usa solo para el ritmo (palabras/min). No es un dato de confianza.

### 5.2 Formulario por bloques
Cada campo se valida con un esquema generado de su definición (`blockSchema`): texto con máximo de caracteres, `select`/`multi` contra lista cerrada de valores, máximo de elecciones, número solo con dígitos. El FormData se lee solo para los campos definidos (no se guardan campos extra). El guardado hace `INSERT … ON CONFLICT DO NOTHING` + `SELECT … FOR UPDATE` + `UPDATE` en una transacción para que dos pestañas no se pisen.

### 5.3 Manual
`rebuildManual` lee brújula, voz y horario, llama a la skill (solo si cambiaron las respuestas del formulario; voz y horario reutilizan la parte creativa) y guarda un `ManualContent` validado. La regeneración con IA tiene un tope propio de 6 por hora por usuario (`manual-ia:user:…`); si se excede se conserva el manual anterior.

### 5.4 PDF
Se genera en el servidor con `pdf-lib` + `@pdf-lib/fontkit`, leyendo `public/fonts/Anton-Regular.ttf` y `Archivo.ttf`. Solo dibuja texto (sin HTML ni URLs). Los textos del usuario se parten por palabras con `widthOfTextAtSize`.

## 6. Configuración nueva

Ninguna variable de entorno nueva. Usa las `S3_*` ya existentes (opcionales para esta fase). Dependencias nuevas: `pdf-lib`, `@pdf-lib/fontkit`. Archivos nuevos en `public/fonts/` (licencia OFL: Anton, Archivo). Carpeta `skills/` con la documentación de cada skill y su esquema.

## 7. Controles de seguridad de esta fase

- Todas las tablas y consultas se filtran por el `user_id` de la sesión; no hay rutas con `[id]` de usuario.
- Validación de entradas con listas cerradas; límites de longitud en todo texto libre.
- Firma de contenido para el audio; tope de tamaño y de duración; audio borrado siempre.
- Límites de frecuencia atómicos (`rate.ts`) en subida de voz, voz escrita, guardado de bloques, descargas de PDF y regeneración con IA.
- Salida validada con zod en ambos sentidos (skill → manual → BD → pantalla/PDF).
- Los textos del usuario solo se renderizan como texto de React (sin `dangerouslySetInnerHTML`).
- Registro de auditoría: `brujula.completed`, `brujula.voice_saved`, `brujula.schedule_saved`, `brujula.manual_downloaded`.

## 8. Riesgos conocidos y decisiones conscientes

1. **Transcripción y skill de brújula son de prueba.** El perfil de voz por audio no refleja lo que dijo el usuario hasta conectar el servicio real. Está señalado en pantalla (`mock`), pero un auditor debe confirmar que ninguna fase futura lo use como si fuera real sin revisar ese campo.
2. **`ai_calls.cost_cents` siempre es 0** hasta que existan llamadas reales; el registro ya está, el cálculo de costo no.
3. **El audio completo se lee en memoria** (`request.arrayBuffer()`, máximo 8 MB) y pasa por el proxy de Next (límite de cuerpo del proxy 10 MB). Es deliberado por el tamaño pequeño; no debe reutilizarse para archivos grandes.
4. **Sin lectura de duración real del audio**: se confía en `segundos` del cliente (acotado a 90–255). Un cliente malicioso solo falsea su propio ritmo.
5. **`voice_samples.transcript` es dato personal** (lo que el usuario dijo). Se conserva mientras exista la cuenta; falta definir su retención y mencionarlo en el aviso de privacidad (pendiente del abogado).
6. **Edición de bloques completados** regenera el manual (con el tope de 6/h). El manual anterior se sobrescribe, sin historial de versiones.
7. **El horario no considera zona horaria** ni calendario; son horas locales del usuario.
8. **Aviso de hidratación en el navegador de pruebas** por un estilo inyectado en un checkbox deshabilitado de Mi marca (`caret-color`), ajeno a la app.

## 9. Qué conviene revisar en la auditoría

- `src/app/api/voz/route.ts`: orden de validaciones, el `finally` que borra el audio, lectura completa en memoria, límites.
- `src/lib/brujula/content.ts` (`blockSchema`, `readBlockForm`): que ningún campo se guarde sin validar y que `multi` no admita valores fuera de la lista.
- `src/lib/brujula/service.ts`: transacción de `saveBlock`, y que `getVoice`/`getSchedule`/`getManual` tratan jsonb corrupto como inexistente.
- `src/lib/auth/gates.ts` (`getApiCreator`): que un usuario suspendido o sin compromiso no pueda subir audio ni bajar el PDF.
- `src/lib/brujula/pdf.ts`: textos muy largos, caracteres no soportados por las fuentes, ruta de fuentes (`process.cwd()` en Docker).
- Regexes de `voice.ts` (`countPhrase` construye una RegExp con frases fijas: confirmar que no entra texto del usuario a la expresión).
- Tope de regeneración con IA (`manual-ia`) y que `rebuildManual` no se pueda forzar sin él.

## 10. Cómo probar

- `npm test` (61 pruebas; nuevas en `tests/brujula.test.ts`: esquemas, etapa, horario, voz, manual, **generación de PDF** y firmas de audio) · `npm run typecheck` · `npm run lint` · `npm run build`.
- Prueba extremo a extremo local (navegador, PGlite): registro → pago simulado → 6 bloques con validación y pausa → voz escrita (texto corto rechazado) → horario con consejo de luz → aceptar → manual completo → PDF `application/pdf` válido → PDF sin sesión = 401.
- **Pendiente en el VPS con la imagen de Docker**: grabación real con micrófono en iPhone (Safari entrega `audio/mp4`) y Android (Chrome entrega `audio/webm`); confirmar que MinIO guarda y borra el audio; descargar el PDF y revisar que las fuentes se incrusten.
