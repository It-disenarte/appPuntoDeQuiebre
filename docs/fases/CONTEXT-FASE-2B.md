# CONTEXT · Fase 2B — Kit visual

Documento para la IA que audita. Fase anterior: [CONTEXT-FASE-2.md](CONTEXT-FASE-2.md) (2A, aprobada). Especificación: `skills/kit-visual/v1/skill.md` (Mishell).

## 1. Alcance

Lo mínimo para que reels y carruseles se vean consistentes: **4 colores, 2 tipografías, estilo de títulos y subtítulos, hasta 2 elementos gráficos**. Sin logo ni manual completo (decisión de la skill).

Juego de **5 rondas + revelación**:

| Ronda | Qué ve | Qué elige | ¿Usa IA? |
| --- | --- | --- | --- |
| 1 | 2 paletas aplicadas a una portada de reel con su propia frase | A o B | Sí |
| 2 | 4 variantes de la ganadora (cambia solo fondo o acento) | 1 de 4 | Sí |
| 3 | Su frase con 4 pares de tipografías | 1 de 4 | Sí |
| 4 | El título con 4 estilos sobre una portada | 1 o 2 de 4 | Sí |
| 5 | Biblioteca fija de 8 elementos pintados con su acento | Hasta 2 | No |
| Revelación | 4 portadas con **sus propias fotos** (3 o 4 que sube) | 👍/👎 por pieza | Sí (modo final) |

Reglas implementadas: botón "Ninguna me convence" con nota (**máx. 2 por ronda**, sin borrar las opciones anteriores; "Ver opciones anteriores"); tras agotarlos, **selector manual** de lista corta; validación **por código** de contraste (≥ 4.5:1) y de tipografías (solo la lista permitida); con 👎 solo se ajusta esa pieza (máx. 3 ajustes; a la 4.ª queda "no usar" y se registra en `preferencias_visuales`); "Terminar con las opciones recomendadas" usa la opción A de cada ronda pendiente.

**Orden:** la skill dice kit antes de la brújula; aquí son independientes (la brújula ya está hecha). El kit se ofrece después de aprobar la brújula.

## 2. Decisiones de diseño

| Decisión | Por qué |
| --- | --- |
| **Tipografías alojadas en el propio servidor** (31 familias de Google Fonts en `public/fonts/kit`, generadas con `scripts/fetch-kit-fonts.mjs`, CSS en `kit-fonts.css`). | No se abre la política de seguridad (CSP) a Google, no hay peticiones externas desde el navegador (privacidad) y el editor Pro (Remotion) usará los mismos archivos. |
| **Lista cerrada de tipografías**: 20 para títulos y 12 de texto. La IA solo puede elegir de ahí (regla 6 de la skill). | Evita fuentes inexistentes e inyección de CSS por el nombre. Se compara sin distinguir mayúsculas y se devuelve el nombre canónico. |
| **Las rondas con IA nunca se generan al abrir una página**: se generan en una acción (botón "Empezar" o al elegir en la ronda anterior). | Un GET (o un prefetch del navegador) no debe disparar llamadas de IA que cuestan. |
| Si la IA devuelve menos opciones válidas de las necesarias tras filtrar, **se completan con opciones de prueba**. | El creador nunca se queda atorado. |
| Fotos: se **re-codifican con `sharp`** (giro por orientación, máx. 1600 px, JPEG) y se guardan en MinIO. | Quita los metadatos (ubicación, cámara) y reduce el peso. |
| Campo `kit_actual` agregado a la entrada de la skill en modo final. | Para que, al recalificar, la IA ajuste solo las piezas con 👎. **Pendiente de confirmar con Mishell** (la regla de oro permite agregar campos). |
| El hook de las vistas previas es la frase de marca (si hay brújula) o la primera frase de su presentación. | La skill pide `gancho_muestra` "de la auditoría o de la voz". |

## 3. Modelo de datos (migración `0005_fase2b_kit_visual.sql`, solo aditiva)

- `kit_visual`: PK `user_id`; `state` jsonb (rondas con sus tandas de opciones, lo elegido, refrescos, elementos, kit final, votos por pieza); `mock`; `approved_at`; `updated_at`. **Se valida con zod al leer**; el guardado usa **control optimista** con `updated_at` (si otra pestaña lo cambió mientras se hablaba con la IA, no se pisa).
- `kit_photos`: `id`, `user_id`, `storage_key`, `content_type`, `size`. Índice por usuario. Máximo 4 por usuario.

## 4. Rutas y autorización

| Ruta | Autorización |
| --- | --- |
| `/mi-marca/kit`, `/kit/ronda/[n]`, `/kit/fotos`, `/kit/revelacion` | `requireCreatorAccess()`; `n` fuera de 1–5 → 404; no se puede abrir una ronda cuyas anteriores no están elegidas (redirige a la etapa actual). |
| Server Actions (`src/lib/kit/actions.ts`) | `requireCreatorAccess()`, siempre sobre el `user.id` de la sesión; límite de 40 llamadas de IA/h por usuario. |
| `POST /api/kit/foto` | `isSameOrigin` + `getApiCreator()` + límite 20/h. Valida `Content-Type` (JPG/PNG/WebP), `Content-Length` ≤ 8 MB y **firma de los primeros bytes**. |
| `GET /api/kit/foto/[id]` | `getApiCreator()`; el id debe ser UUID y pertenecer al usuario (si no, 404). `Cache-Control: private`, `nosniff`. |

## 5. Flujos sensibles

- **Elección de opciones:** el valor llega como `tanda:id` y se busca en el estado guardado; no se acepta un objeto enviado por el cliente. Ronda 4 admite 1–2; las demás, 1.
- **Cambiar una ronda ya elegida** invalida el kit final y los votos (se vuelve a revelar).
- **Revelación:** requiere las 4 rondas elegidas y ≥ 3 fotos; el kit final pasa `checkFinalKit` (tipografías permitidas, contraste del texto y del título de portada); si no pasa, se usa el generador de prueba.
- **Votos:** solo piezas de la lista cerrada; motivos de la lista cerrada; nota ≤ 300 caracteres. Máx. 3 ajustes por pieza.
- **Borrar una foto** quita la fila y el objeto de MinIO; si el kit aún no estaba aprobado, se invalida la revelación.

## 6. Configuración nueva

Sin variables nuevas (usa `ANTHROPIC_API_KEY` y `S3_*` ya existentes). `Dockerfile`: copia `sharp`, `@img`, `detect-libc` y `semver` a la imagen (módulo nativo, como argon2); `next.config.ts`: `sharp` en `serverExternalPackages`.

## 7. Controles de seguridad

- Todo filtrado por `user_id` de la sesión; fotos solo visibles a su dueño.
- Listas cerradas para tipografías, elementos, piezas y motivos; colores `#RRGGBB` validados y normalizados.
- Firma de contenido y tope de tamaño en las fotos; metadatos eliminados.
- Límites atómicos de frecuencia en IA y subida; control optimista contra ediciones simultáneas.
- Salida de IA validada con zod antes de guardar; los errores de la IA se registran con detalle y al usuario solo se le muestra un aviso claro.
- CSP sin cambios (las fuentes y estilos son del mismo origen).

## 8. Riesgos conocidos y decisiones conscientes

1. **Todo el kit corre en modo de prueba hasta que se pruebe con IA real** (el generador de reglas respeta el esquema). La ruta con Claude para el kit **no está verificada**; la de las otras skills sí.
2. **`sharp` en la imagen de Docker no se ha probado** (nunca se construyó localmente). Si falla, `normalizePhoto` rechaza la foto con un mensaje (no guarda el original sin limpiar). Hay que probar la subida en el VPS.
3. **Las vistas previas son HTML/CSS, no el render final** (Remotion llega en la versión 2): el aspecto real de un reel puede diferir.
4. **El gusto de las opciones de prueba es tosco** a propósito; la calidad real depende del prompt de Mishell.
5. **Las fotos del creador** (datos personales) se guardan mientras exista la cuenta; falta definir retención y mencionarlo en el aviso de privacidad.
6. **Los pesos de las tipografías son los descargados** (p. ej. un solo peso para algunas): el texto en otros pesos usa el más cercano.
7. **`kit_actual`** en la entrada de la skill es un campo agregado, sin confirmar con Mishell.
8. No se calcula todavía si una paleta es apta para daltonismo; solo contraste de luminancia.

## 9. Qué conviene revisar

- `src/lib/kit/service.ts`: control optimista (`saveState`), `sanitize` (completado con opciones de prueba), `submitVotes` (topes y estados), borrado de fotos.
- `src/app/api/kit/foto/**`: validaciones, `normalizePhoto` y que ninguna ruta sirva fotos ajenas.
- `src/lib/kit/schemas.ts` y `fonts.ts`: validación de lo que devuelve la IA (colores, tipografías, contraste).
- `src/components/kit/KitPreview.tsx`: estilos en línea construidos con valores de la IA (colores validados con regex, familias de lista cerrada; el texto se renderiza como texto de React).
- Dockerfile: copia de módulos nativos.

## 10. Cómo probar

- `npm test` (94; `tests/kit.test.ts`: contraste, tipografías permitidas, inyección de CSS por nombre, validación de la salida de la IA, generador de prueba de cada ronda, kit final y ajuste por pieza), `npm run typecheck`, `npm run lint`, `npm run build`.
- Prueba extremo a extremo local (navegador): índice → ronda 1 (generar) → elegir → ronda 2 con 2 "Ninguna me convence" y selector manual → rondas 3, 4 (máx. 2 estilos) y 5 (máx. 2 elementos) → fotos (botón deshabilitado sin fotos) → revelación → 👎 ×4 en una pieza (3 ajustes y luego "no usar") → aprobado → índice "Tu kit está listo".
- **Pendiente en el VPS:** subir fotos reales (MinIO + sharp), correr el kit con la IA real, y revisar las vistas previas en iPhone/Android.
