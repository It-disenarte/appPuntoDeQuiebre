# CONTEXT · Fase 6 — Parrilla semanal, guiones, textos e historias

Documento para la IA que audita. Fases anteriores: [2](CONTEXT-FASE-2.md), [2B](CONTEXT-FASE-2B.md). Especificación: guía de Luis (Fase 6 y "Planes y reglas del motor") y las skills `textos-publicacion-v2` e `ideas-historias-v2` de Mishell.

## 1. Alcance

Con la brújula aprobada, el perfil de voz y el horario aceptado, el creador pulsa **"Generar mi semana"** y recibe:

- **Parrilla** de lunes a domingo: **Básico** 4 videos (3 distintos + 1 variante de prueba) y 3 carruseles; **Pro** 5 videos (4 + 1 variante) y 2 carruseles. Cada pieza lleva fecha, hora de publicación (la del horario o 18:00), categoría (viral, nicho, conversión), tipo (probado o prueba), pilar, tema, idea y **guion** (gancho, cuerpo, cierre, duración y nota de grabación; en carruseles, título, idea central, puntos y cierre).
- **Mezcla por etapa**: arranque 50/40/10, crecimiento 40/40/20, monetización 30/40/30 y 50/50/0 si no tiene nada que vender. Máximo **1 prueba por semana** (la variante del domingo, alternando "gancho" y "ángulo") con su **tarjeta de prueba**.
- **Textos de publicación por red** (solo las redes que usa): 3 ganchos para elegir, texto de Instagram/TikTok/Facebook, hashtags, primer comentario, texto en pantalla y datos a verificar. **Modo aprendizaje** (primeras 10 piezas: 👍/✏️/👎 por red y elegir gancho) y **modo rápido** (botón Copiar; copiar sin editar cuenta como 👍; "Ver otros ganchos").
- **Historias**: una idea por día (menos de 5 min) de una biblioteca de 11 tipos, con "Otra idea", voto en 3 niveles (primeras 2 semanas), texto editable, "Ya la subí" y **un día a la semana idea propia** (mínimo 15 palabras). Tarjeta de **enfoque semanal** (1 a 3 temas y tipos que no quiere ver por 4 semanas).
- **Hoy** ahora muestra datos reales: tarea de hoy, historia del día, próxima sesión de grabación (del horario), racha de la semana (vista previa) y pendientes de la alta.

Fuera de alcance: "lo probado" desde el analizador (Fase 5, bloqueada), publicación en Instagram (Fase 9), grabación (Fase 7) y carruseles gráficos (Fase 8).

## 2. Decisiones y riesgos conocidos

| # | Decisión / riesgo |
| --- | --- |
| 1 | **La skill de guiones es un borrador mío** (`skills/parrilla-guiones/v1/skill.md`, marcado así): Mishell no entregó una. Debe revisarla o reemplazarla. |
| 2 | **Las reglas corren en código** (`src/lib/plan/rules.ts`): mezcla, patrón de la semana, reparto, etapa y modo de los textos. La IA solo pone tema y guion de cada espacio. |
| 3 | **Sin "lo probado" real**: antes de 30 videos debe venir del analizador (bloqueado). Hoy los temas salen de las `ideas_de_tema` de la brújula; no hay datos de seguidores, así que la etapa es "arranque" salvo que el creador tenga más de 60 días y se conozca su audiencia. |
| 4 | **La mezcla no se ajusta por aprendizaje** todavía (`adjustMix` existe y está probada, pero no hay métricas que la alimenten; Fase 11). |
| 5 | Una pieza **se genera con una llamada por semana** (todas las piezas juntas) y una más para las historias; los textos de cada pieza son una llamada aparte, a petición. Límites: 6 semanas/h y 40 textos/h por usuario. |
| 6 | Los textos no reciben todavía el gancho que el creador eligió al regenerar (la skill no define ese campo); elegir otro gancho se guarda como preferencia. |
| 7 | La racha de Hoy es **vista previa manual** (publicó o marcó la historia): la verificación por la API de Instagram es de la Fase 10. |
| 8 | Se genera la semana actual si hoy es lunes a miércoles y la siguiente si no; solo se aceptan lunes de la semana pasada a dos semanas adelante. |
| 9 | Todo corre con respuestas de prueba si falta `ANTHROPIC_API_KEY`, marcado en pantalla. Con llave, **la ruta con Claude para estas tres skills no está verificada**. |

## 3. Modelo de datos (migración `0006_fase6_parrilla.sql`, solo aditiva)

`week_plans` (única por usuario y semana; mezcla, etapa, plan, enfoque, `mock`), `content_pieces` (única por plan y `n`; guion y variante en jsonb; textos y calificación en jsonb; estado) y `story_ideas` (única por plan y día; alternativa actual, voto, texto editado, idea propia, hecha). Todo con `ON DELETE CASCADE`. Los jsonb se **validan con zod al leer**.

## 4. Rutas y autorización

Páginas `/semana`, `/semana/[id]` y `/hoy` con `requireCreatorAccess()`; `[id]` debe ser UUID y pertenecer al usuario (si no, 404). Todas las Server Actions (`src/lib/plan/actions.ts`) usan `requireCreatorAccess()` y operan sobre `user.id` de la sesión; las consultas por id filtran también por `user_id`.

## 5. Flujos sensibles

- **Generar semana:** valida requisitos (brújula aprobada, voz y horario), la fecha pedida (lunes en rango), limita a 6/h y es **idempotente** (índice único + `ON CONFLICT DO NOTHING`: dos pestañas no la duplican). Los temas y tipos apagados se recortan (3 temas de 40 caracteres; 8 tipos).
- **Textos:** solo para redes de la lista (instagram, tiktok, facebook); el gancho elegido debe ser 0–4; el texto editado se recorta a 4000 caracteres.
- **Historias:** la idea propia exige ≥ 15 palabras; "Otra idea" recorre las alternativas en orden y vuelve a la primera (tope de 20).

## 6. Qué conviene revisar

- `src/lib/plan/rules.ts`: reparto con resto mayor, patrón y reglas de la guía; fechas en la zona de la Ciudad de México.
- `src/lib/plan/service.ts`: transacción de `generatePlan`, validación de lo que devuelve la IA y lectura segura de jsonb.
- `skills/parrilla-guiones/v1/skill.md`: el borrador de la skill.
- Que ninguna acción permita leer o modificar piezas o historias de otro usuario.

## 7. Cómo probar

`npm test` (114; `tests/plan.test.ts` cubre mezclas, etapa, fechas, patrón Básico/Pro, variante, modo de textos y las tres skills de prueba), `npm run lint`, `npm run typecheck`, `npm run build`. Recorrido en navegador: sin brújula pide lo que falta → alta completa → generar con enfoque (máx. 3 temas) → 7 piezas (4 videos, 3 carruseles, 1 prueba) → detalle → textos (3 ganchos, solo Instagram y TikTok) → elegir gancho, 👍, ✏️ → "Ya la grabé" → historias (otra idea, voto, idea propia corta y válida, ya la subí) → Hoy. **Pendiente en el VPS** con IA real.
