# CONTEXT · Fase 2 (parte A) — Alta del creador con las skills de Mishell

Documento para la IA que audita. Describe qué se construyó, cómo, y dónde buscar errores o vulnerabilidades.
Fase anterior: [CONTEXT-FASE-1.md](CONTEXT-FASE-1.md). Especificación: las skills de Mishell en [`skills/`](../../skills/) y la "Guía de desarrollo" de Luis.
Dudas abiertas para Mishell y Moy: [../pendientes-skills.md](../pendientes-skills.md).

> **Historia de esta fase.** Una primera versión (commit `caa590e`) usaba un formulario de 6 bloques que yo había propuesto. Al recibir las skills de Mishell, que definen otro flujo, se **rediseñó** sobre su especificación. Las migraciones `0002` (formulario viejo) y `0003`/`0004` (se eliminan esas tablas y se crean las nuevas) quedan en el historial; las tablas viejas solo tenían cuentas de prueba.

## 1. Alcance

Con pago activo y compromiso aceptado, el creador hace su **alta dinámica**:

1. **Tu historia** (skill brujula-v2, sección 1B): 7 preguntas, una a la vez, por **voz o por texto**, con mínimos (30 s/50 palabras, 45 s/80, 2 min/250 en la historia), barra de progreso, **una sola repregunta amable** si queda corta, y **cualquier pregunta se puede saltar**. La historia se elige entre 3 opciones; la pregunta 7 es de botones (¿vendes algo?).
2. **Elecciones rápidas**: redes, formatos, tono (máx. 3) y 3 a 5 cuentas de referencia (mínimo 3).
3. **Brújula de marca** (skill `brujula-v2`): nicho, público, propuesta de valor, frase de marca, pilares, tono, palabras sí/no, postura, puente, visión, estilo de grabación, lives. Se revela **por 5 secciones** que el creador califica 👍 / ✏️ (ajuste corto, ≤120 caracteres) / 👎 (nota obligatoria); máximo 3 ajustes por sección; con las 5 en 👍 queda **aprobada** y se habilita el **PDF**.
4. **Perfil de voz** (skill `perfil-voz-v1`), generado junto con la brújula.
5. **Horario** (skill `horario-v1`): reglas fijas implementadas en código (sin IA, como indica la skill): 2 bloques fijos + 1 de respaldo, por día elige momento y tiempo, "a veces no puedo", consejos de luz y lugar, recordatorios (como datos), hora de publicación.
6. **Capa de skills**: cada skill es un archivo versionado en `skills/<nombre>/v<N>/skill.md` (el archivo completo se manda como *system prompt*). Si hay `ANTHROPIC_API_KEY` se ejecuta con Claude y se valida con el esquema real; **sin llave responde una versión de PRUEBA** (reglas) con el mismo esquema, marcada `mock` en pantalla. Cada llamada se registra en `ai_calls`.

**Decisiones del usuario (2026-10-16):** (a) la fase se parte: **2A** (esto) y **2B** (kit visual de 5 rondas); (b) la **auditoría** (skill 0) necesita Instagram y se hace en la Fase 3: por ahora la brújula corre en modo `sin_contenido`; (c) se trabaja con el **esquema real y respuestas de prueba** hasta tener llaves.

Fuera de alcance: kit visual (2B), auditoría y tarjetas "Así te vemos" (Fase 3), prueba de voz con 3 guiones (requiere la skill de guiones, no entregada), recordatorios Web Push (Fase 10), revisión automática del horario si falla 2 bloques (Fase 10).

## 2. Archivos principales

| Ruta | Para qué |
| --- | --- |
| `skills/**/skill.md`, `skills/README.md` | Skills de Mishell, versionadas, fuera del código. |
| `src/lib/skills/schemas.ts` | Esquemas zod de salida de brujula-v2, perfil-voz-v1 y horario-v1 (con `passthrough`: la regla de oro permite agregar campos). |
| `src/lib/skills/index.ts` | Ejecutor: llama a Anthropic (fetch) o usa la versión de prueba; valida salida; registra en `ai_calls`. |
| `src/lib/skills/mock.ts` | Versión de prueba de brujula-v2 y perfil-voz-v1 y armado de la `muestra_voz`. |
| `src/lib/brujula/content.ts` | Los 7 pasos, elecciones rápidas y sus esquemas. |
| `src/lib/brujula/schedule.ts` | Reglas de `horario-v1`. |
| `src/lib/brujula/voice.ts` | Estadísticas de voz (reglas) y las transcripciones de prueba. |
| `src/lib/brujula/service.ts`, `actions.ts` | Acceso a datos y Server Actions. |
| `src/lib/brujula/pdf.ts` | PDF de la brújula (pdf-lib + fuentes Anton/Archivo en `public/fonts`). |
| `src/lib/form-submit.ts` | Envía formularios a acciones sin que React 19 los reinicie al fallar. |
| `src/app/api/historia/audio/route.ts`, `src/app/api/manual/pdf/route.ts` | Audio por paso y descarga del PDF. |
| `src/app/(app)/mi-marca/{historia,manual,voz,horario}/…` | Pantallas. |
| `drizzle/0003_*`, `drizzle/0004_*` | Se eliminan las tablas del primer intento y se crean las nuevas. |

## 3. Modelo de datos

| Tabla | Contenido |
| --- | --- |
| `creator_intake` | PK `user_id`. `story` jsonb (pasos, historia elegida, qué vende), `quick` jsonb, `completed_at`. **Texto, nunca audio.** |
| `brand_manuals` | PK `user_id`. `content` (salida de brujula-v2), `votes` por sección `{voto: si|pendiente, nota, ajustes}`, `status` borrador/aprobado, `mock`, `skill_version`. |
| `voice_profiles` | PK `user_id`. `content` (salida de perfil-voz-v1), `mock`. |
| `schedules` | PK `user_id`. `answers` y `result` (salida de horario-v1), `accepted_at`. |
| `ai_calls` | Por llamada: skill, versión, `mock`, estado, `cost_cents` (hoy 0), tokens. |

Todo con `ON DELETE CASCADE` desde `users`. **Todo jsonb se valida con zod al leerlo**; si está dañado se trata como inexistente.

## 4. Rutas y autorización

| Ruta | Autorización |
| --- | --- |
| Páginas `/mi-marca/historia`, `/historia/[paso]`, `/historia/elecciones`, `/manual`, `/voz`, `/horario` | `requireCreatorAccess()` (sesión + pago/gracia + compromiso). `[paso]` desconocido → 404. |
| Server Actions de `actions.ts` | `requireCreatorAccess()`; siempre sobre el `user.id` de la sesión. |
| `POST /api/historia/audio` | `isSameOrigin` + `getApiCreator()` + límite 40/h por usuario. |
| `GET /api/manual/pdf` | `getApiCreator()` + límite 20/h; solo el propio manual, solo si está **aprobado** (409 si no). |

## 5. Flujos sensibles

**5.1 Audio por paso.** Valida origen, sesión con acceso, límite, paso (lista cerrada, solo pasos de voz), duración (≥ mínimo del paso, o ≥10 s si es la segunda vez tras la repregunta; ≤ 315 s), `eleccion` válida en la historia, `Content-Type` en lista cerrada, `Content-Length` presente y ≤ 8 MB y **firma de los primeros bytes**. El audio se guarda en MinIO solo mientras se transcribe y se **borra siempre** en `finally`. La transcripción real (Gemini) no está conectada: devuelve `null` y se usa un texto de ejemplo por paso, marcado `mock`.

**5.2 Ejecución de skills.** Con llave: `POST https://api.anthropic.com/v1/messages` con el `skill.md` como `system`, entrada JSON como mensaje, timeout de 120 s. La respuesta se extrae (`extractJson`, tolera ```json) y se valida con zod; si no cumple el esquema, **se rechaza y no se guarda**. La llave se lee de `env()` y nunca se envía al navegador. **Esta ruta con llave real NO se ha probado** (no hay llave); solo la de prueba y `extractJson` tienen pruebas.

**5.3 Calificación del manual.** `voteSection` reintenta la skill con un campo nuevo `ajuste` (sección, voto, nota, manual actual) y guarda el resultado; la sección vuelve a "pendiente" hasta que se califique otra vez. Topes: 3 ajustes por sección (en BD), 15 ajustes/h por usuario, 4 generaciones/h por usuario (`manual-ia`).

**5.4 Horario.** Entradas validadas con zod (mín. 2 días, sin repetidos, momento por día, duraciones cerradas). Las reglas son determinísticas.

**5.5 Formularios.** Los formularios cliente usan `submitKeepingState`: con `action={fn}`, React 19 reinicia el formulario tras un error y desmarcaba lo elegido (bug encontrado en pruebas).

## 6. Configuración nueva

`ANTHROPIC_API_KEY` (opcional; sin ella todo corre en modo de prueba) y `SKILLS_MODEL` (por defecto `claude-sonnet-5-5`). El `Dockerfile` ahora copia `skills/` a la imagen. La carpeta de trabajo de Mishell (`Punto-de-Quiebre-ClaudeCode*/`, 60 MB con datos de Blombito) está en `.gitignore` y `.dockerignore`. Dependencias nuevas: `pdf-lib`, `@pdf-lib/fontkit`.

**5.6 Transcripción con Gemini** (`src/lib/skills/transcribe.ts`). Con `GEMINI_API_KEY` el audio se manda inline (base64, ≤ 8 MB) a `generateContent` con la llave en el encabezado `x-goog-api-key` (nunca en la URL) y un prompt con el nombre del creador (y de su marca, cuando exista) para escribirlos bien. Si el audio no trae voz → `NoSpeechError` → 422 con mensaje amable. Los errores HTTP incluyen el detalle pero no la llave. **Sin probar con una llave real**: riesgo principal, que Gemini no acepte `audio/webm` (Chrome); si lo rechaza habrá que convertir el audio (ffmpeg) antes de enviarlo. Pruebas con `fetch` simulado en `tests/transcribe.test.ts`. El audio sale a Google: debe mencionarse en el aviso de privacidad.

## 7. Controles de seguridad

- Filtro por `user_id` de la sesión en todo; no hay rutas con id de usuario.
- Listas cerradas y límites de longitud en todo texto libre (respuestas de hasta 6000 caracteres).
- Firma de contenido, tope de tamaño y de duración en el audio; borrado siempre.
- Límites atómicos (`rate.ts`) en historia, audio, ajustes, generación con IA y PDF.
- Salida de IA validada con esquema antes de persistir; contenido solo renderizado como texto de React; PDF solo dibuja texto.
- Auditoría: `brujula.voice_saved`, `brujula.manual_generated`, `brujula.manual_approved`, `brujula.schedule_saved`, `brujula.manual_downloaded`.
- Privacidad (regla 13 de la skill): "lo íntimo no se publica". La **versión de prueba no filtra contenido sensible**; con IA real depende del prompt de Mishell, y conviene que el auditor revise los resultados reales cuando existan.

## 8. Riesgos conocidos y decisiones conscientes

1. **Todo corre en modo de prueba** (sin IA). La transcripción y el contenido de brújula/perfil son de reglas; pantallas y PDF lo avisan. Ninguna fase posterior debe usar esos datos como reales sin revisar `mock`.
2. **Ruta con IA real sin probar** (§5.2). Riesgos: formato de respuesta, longitud (`max_tokens` 8000), costo, y que la skill devuelva campos fuera de esquema.
3. **`ai_calls.cost_cents` siempre es 0**; solo se guardan los tokens.
4. **Campo `ajuste` inventado por mí** para recalificar secciones: la skill describe el comportamiento (regla 14) pero no el formato de entrada. Está pendiente de acordar con Mishell y Moy.
5. **Texto de las respuestas de voz = dato personal** y se conserva mientras exista la cuenta; falta definir retención y mencionarlo en el aviso de privacidad (abogado).
6. **Horario:** (a) la regla 4 (mañana 08:00) contradice el ejemplo de Blombito (domingo 10:00); se siguió la regla. (b) No se implementó partir un día de 1 h en dos tramos con descanso (la skill es ambigua). (c) `cuando` de los recordatorios usa el formato del ejemplo ("lunes 20:00"), no el del esquema.
7. **Sin auditoría ni tarjetas** hasta la Fase 3: la brújula no tiene `puente` y su calidad será menor que la diseñada.
8. **Audio completo en memoria** (≤ 8 MB) en el servidor; deliberado por el tamaño.
9. **La prueba de voz (3 guiones)** no se implementó: la skill no define quién genera los guiones de prueba.
10. Un cambio en las respuestas de "Tu historia" **no regenera** la brújula automáticamente; hay un botón "Rehacer mi brújula" (reinicia las calificaciones).

## 9. Qué conviene revisar

- `src/app/api/historia/audio/route.ts`: orden de validaciones y el borrado en `finally`.
- `src/lib/skills/index.ts`: manejo de la llave, errores de red, validación de la salida y que ningún error filtre la respuesta cruda al usuario.
- `src/lib/brujula/service.ts`: transacción de `mutateIntake`, `voteSection` (topes y estado) y lectura segura de jsonb.
- `src/lib/brujula/actions.ts`: que un usuario sin acceso no pueda ejecutar ninguna acción y que las repreguntas (`insisted`) no se puedan abusar para saltarse mínimos (solo relaja el mínimo de palabras en la misma sesión; el servidor no confía en otra cosa).
- `src/lib/brujula/schedule.ts`: casos borde (todos los días "a veces", solo 2 días, bloques que cruzan medianoche).
- `src/lib/brujula/pdf.ts` y `public/fonts` (ruta con `process.cwd()` en Docker; `skills/` también se lee con `process.cwd()`).

## 10. Cómo probar

- `npm test` (70 pruebas; en `tests/brujula.test.ts`: reglas del horario incl. el ejemplo de Blombito, validación de la alta, esquemas de las skills de prueba, ajuste por sección, extracción de JSON, PDF y firma de audio), `npm run typecheck`, `npm run lint`, `npm run build`.
- Prueba extremo a extremo local en navegador (PGlite, micrófono simulado): Hoy → 7 pasos (audio corto con repregunta, audio ≥30 s, texto corto con repregunta, saltar, historia sin elegir, vende sin descripción) → elecciones (tono máx. 3, mínimo 3 referentes) → generar → PDF 409 sin aprobar → ajuste ✏️ → 5×👍 → aprobada → perfil de voz → horario (ejemplo de Blombito) → aceptar → PDF 200 → PDF sin sesión 401.
- **Pendiente en el VPS:** grabación con micrófono real en iPhone (Safari: `audio/mp4`) y Android (Chrome: `audio/webm`); conectar `ANTHROPIC_API_KEY` y probar las skills reales.
