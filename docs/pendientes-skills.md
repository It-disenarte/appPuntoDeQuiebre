# Decisiones y dudas sobre las skills (para Mishell y Moy)

Surgieron al conectar `brujula-v2`, `perfil-voz-v1` y `horario-v1` en la Fase 2A. El 2026-10-16 el usuario aceptó las recomendaciones de las dudas 1 a 8; quedan como decisiones registradas. **Mishell debe actualizar sus archivos originales** con lo marcado como "cambia en su copia".

## Decisiones tomadas (2026-10-16)

| # | Tema | Decisión | Qué cambió |
| --- | --- | --- | --- |
| 1 | Campo `ajuste` para recalificar una sección | **Confirmado tal cual.** `ajuste: { seccion, voto, nota, manual_actual }` se agrega a la entrada de `brujula-v2` (la regla de oro permite agregar campos). Probado con Claude real: ✏️ y 👎 cambian solo la sección pedida. | Nada. Mishell: agregarlo a la sección "Entrada" de su skill. |
| 2 | `formalidad` del perfil de voz | **Número entero de 1 a 5.** | Cambia en su copia (`skills/perfil-voz/v1/skill.md`): el esquema dice `3` con el comentario, no `"1 a 5"`. Mishell: igual en el original. |
| 3 | Formato de `cuando` en recordatorios | **El del ejemplo:** `"lunes 20:00"`. | Nada. Mishell: corregir la línea del esquema (`dia_anterior_20:00 \| 1h_antes`). |
| 4 | Hora de inicio de la mañana | **08:00 entre semana y 10:00 en fin de semana.** Con esto el ejemplo de Blombito (domingo 10:00 a 12:00) sale igual. | Código (`schedule.ts`), prueba nueva y regla 4 de su copia. Mishell: igual en el original. |
| 5 | Día de solo 1 hora | **Un solo bloque**, con el consejo "graba un solo video y llega con el guion leído". No se parte en dos tramos ni se suma un tercer bloque. | Nada. Mishell: aclarar o quitar la frase de la regla 2 sobre dos tramos. |
| 6 | Prueba de voz (3 guiones) | **Se hace en la Fase 6**, cuando llegue la skill de guiones. | Nada por ahora. |
| 7 | Brújula antes del kit visual | **Corre sin kit** (`kit_visual: null`) y se puede rehacer después. La IA real lo acepta (`kit_visual_ref` puede ser `null`). | Esquema tolerante. Mishell: indicar que sin kit `kit_visual_ref` va en `null`. |
| 8 | "Lo íntimo no se publica" (regla 13) | **Se confía en el prompt**, y los primeros resultados reales se revisan a mano antes de abrir a usuarios. | Nada. |

## Ya resueltas antes

- **Transcripción** (antes la duda 9): usa **Gemini**, verificado en el VPS. Se le manda el nombre de quien habla para escribirlo bien (funcionó con "Plombito"). Falta sumar el nombre de la marca cuando exista en el perfil.
- **Auditoría y tarjetas** (antes la 11): esperan a la Fase 3 (Instagram); mientras tanto la brújula corre en modo `sin_contenido`, con `puente: null`.
- **Costo por llamada** (antes la 10): `ai_calls` guarda los tokens; el costo en pesos se calcula cuando se construya el panel de métricas del negocio (Fase 7), con una tabla de precios por modelo.

## Siguen abiertas (de `pendientes-moy.md`)

- Métricas de la cuenta propia (opción A/B/C de Meta): se decide en la Fase 3.
- Dónde se generan las imágenes de los carruseles y si en Pro se usa la API de Gemini.
- Costo por alta de cada cliente (Claude + Gemini + Apify): se puede estimar con los tokens que ya se registran.
