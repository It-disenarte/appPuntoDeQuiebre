# Pendientes y dudas sobre las skills (para Mishell y Moy)

Surgieron al conectar `brujula-v2`, `perfil-voz-v1` y `horario-v1` en la Fase 2A. Marcado como [Mishell] o [Moy] según quién decide.

## Esquemas y entradas

1. **[Mishell + Moy] Ajuste por sección.** La skill dice que con ✏️ cambia "solo lo que dice la nota" y con 👎 reescribe la sección, pero no define la entrada. Hoy la app manda la entrada normal más un campo nuevo:
   ```json
   "ajuste": { "seccion": "nicho | publico | pilares | tono | postura", "voto": "ajustar | no", "nota": "string", "manual_actual": { "...salida actual de la brújula": {} } }
   ```
   ¿Les sirve así? (Es un campo agregado: la regla de oro lo permite.)
2. **[Mishell] Perfil de voz, `formalidad`.** El esquema dice `"1 a 5"` (texto) y el ejemplo trae el número `2`. La app acepta número entero de 1 a 5.
3. **[Mishell] Horario, `cuando` de los recordatorios.** El esquema dice `dia_anterior_20:00 | 1h_antes`; el ejemplo usa `"lunes 20:00"`. La app sigue el ejemplo.
4. **[Mishell] Horario, hora de inicio.** La regla 4 dice mañana 08:00; el ejemplo de Blombito pone el domingo (mañana) a las 10:00. La app sigue la regla (08:00). ¿Cuál queda?
5. **[Mishell] Horario, día de 1 hora.** La regla 2 dice que se parte en dos tramos con 15 minutos de descanso "(1 h + 30 min)" o se suma un tercer bloque fijo. No quedó claro; no está implementado.
6. **[Mishell] Prueba de voz.** Pide "3 guiones cortos de prueba (uno por pilar)", pero ninguna skill entregada genera guiones. ¿Qué skill los hace? Sin ella no se puede construir esa pantalla.
7. **[Mishell] Brújula con campo `kit_visual`.** Hoy se manda `null` (el kit visual se construye en la Fase 2B). ¿La brújula debe poder correr sin kit y regenerarse después?

## Producto

8. **[Mishell] Lo íntimo no se publica (regla 13).** Con IA real, ¿quieren que la app filtre algo por su cuenta (por ejemplo, avisar si la historia menciona salud o familia), o se confía solo en el prompt?
9. **[Moy] Transcripción.** El transcriptor debe recibir el nombre de la marca como contexto (ya transcribió "Plombito"). Hoy la transcripción es de prueba; falta la cuenta y la llave de Gemini.
10. **[Moy] Costos.** `ai_calls` guarda tokens pero el costo en centavos queda en 0: falta la tabla de precios por modelo para calcularlo.
11. **[Mishell] Modo sin auditoría.** Hasta la Fase 3 la brújula no tiene auditoría ni tarjetas ("Así te vemos"). Está contemplado (`modo: sin_contenido`), pero el `puente` queda en `null` y los datos de audiencia en `datos_faltantes`.

## Pendientes ya anotados en `pendientes-moy.md` que siguen abiertos

- Métricas de la cuenta propia (opción A/B/C): se decide en la Fase 3.
- Dónde se generan las imágenes y costo por alta de cada cliente.
