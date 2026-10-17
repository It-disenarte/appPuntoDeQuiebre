# Skill 3: Horario
**Versión:** v1 (borrador — esquema JSON pendiente de acordar con Moy)
**Responsable:** Mishell · **Conecta:** Moy · **IA:** reglas fijas (Claude solo para el mensaje)
**Cuándo corre:** justo después del alta. Se puede rehacer desde ajustes; se revisa sola si el creador falla 2 bloques seguidos.

---

## 1. Propósito

Fijar **cuándo graba** el creador (2 bloques fijos + 1 de respaldo a la semana, de 3 a 4 horas en total) y **cuándo publica**, para que la app le recuerde y la racha tenga sentido. Además le da 2 o 3 consejos prácticos según dónde y con qué luz graba.

**Por qué con reglas y no con IA:** son pocas respuestas con opciones fijas; con reglas sale igual cada vez y no cuesta tokens. Claude solo redacta el mensaje final con la voz de la app.

## 2. Introducción (antes de las preguntas)

Una pantalla corta, con el tono de la app, que explica **por qué** pedimos días fijos:

> **Tu horario para crear**
> Los creadores que crecen no son los que tienen más tiempo, son los que **no fallan**. Por eso vamos a apartar días fijos en tu semana, como una cita contigo, que no cambien cada semana.
> - Cuando grabar ya tiene día y hora, no tienes que decidirlo cada vez: solo llegas y grabas.
> - Tu público se acostumbra a verte seguido, y el algoritmo también.
> - La app te avisa un día antes y una hora antes, para que llegues con tu guion listo.
> Elige días que **sí puedas cumplir**, aunque sean pocos. Es mejor 2 días seguros que 5 a medias.
>
> [Empezar]

## 2B. Preguntas (pantalla con botones, menos de 1 minuto)

| # | Pregunta | Opciones |
|---|---|---|
| 1 | ¿Qué días puedes grabar? | L · M · X · J · V · S · D (varias; mínimo 2) |
| 2 | **Panel por cada día elegido:** ¿en qué momento? · ¿cuánto tiempo ese día? · "a veces no puedo" | Momento: Mañana · Mediodía · Tarde · Noche (varias) · Tiempo: 30 min · 1 h · 1 h 30 · 2 h · 3 h (una por día) |
| 3 | ¿Dónde grabas? | Casa · Oficina o trabajo · Exteriores · Varía (varias) |
| 4 | ¿Con qué luz cuentas? | Ventana / luz natural · Aro de luz · Lámpara · Ninguna en especial (varias) |

**Aprendido en la prueba:** todas las preguntas son de selección múltiple, y el momento **y el tiempo** se eligen **por día** en un panel que se abre por cada día, porque no todos los días se tiene el mismo horario. La luz se cruza con el momento: de día cuenta la ventana; de noche, el aro y las lámparas.

## 3. Entrada

```json
{
  "creador_id": "string",
  "respuestas": {
    "dias": [{ "dia": "L | M | X | J | V | S | D", "momentos": ["manana | mediodia | tarde | noche"], "duracion_min": 60, "a_veces_no": false }],
    "lugar": ["casa | trabajo | exteriores | varia"],
    "luz": ["natural | aro | lampara | ninguna"]
  },
  "mejor_hora_publicar": "HH:MM (de la auditoría; null si no hay)",
  "zona_horaria": "America/Mexico_City"
}
```

## 4. Salida

```json
{
  "skill_version": "horario-v1",
  "bloques": [
    { "tipo": "fijo | respaldo", "dia": "L", "inicio": "HH:MM", "fin": "HH:MM" }
  ],
  "horas_semana": 3.5,
  "publicar": { "hora": "HH:MM", "por_que": "string" },
  "recordatorios": [
    { "cuando": "dia_anterior_20:00 | 1h_antes", "texto": "string" }
  ],
  "consejos": ["string (2 o 3)"],
  "mensaje": "string (1 o 2 frases con la voz de la app)"
}
```

## 5. Reglas

1. **2 bloques fijos + 1 de respaldo.** Los fijos en días no seguidos cuando se pueda (ej. martes y jueves); el respaldo, en otro día que haya marcado. **Un día con "a veces no puedo" nunca es fijo**: va como respaldo. Si para llegar a 3 horas se necesitan todos los días que eligió, todos van como fijos y el respaldo es **flotante**: si falta a uno, la app le pregunta qué otro día de esa semana lo recupera.
2. **Meta de 3 a 4 horas por semana** entre los fijos. Si los días seguros no llegan a 3 horas, la app **no lo obliga**: le muestra cuánto suma y le sugiere alargar un día o sumar otro; si no puede, se acepta y el día de "a veces" cuenta como **día extra** cuando sí se pueda. Se usa el tiempo de **cada día** (`duracion_min` por día). Si un día solo tiene 1 h, el bloque de ese día se parte en **dos tramos con 15 minutos de descanso** (1 h + 30 min) o se suma un tercer bloque fijo. Primer tramo: lo que más energía pide (frente a cámara); segundo tramo: tomas de apoyo, clips y fotos.
3. **Preferir entre semana**; fin de semana solo si no marcó suficientes días entre semana o si lo eligió como respaldo.
4. **Horas por momento:** mañana 08:00 · mediodía 12:00 · tarde 16:00 · noche 19:00 (inicio sugerido; el creador puede moverlo).
5. **Grabar con luz:** si el momento es noche y la luz es "natural" o "ninguna", el consejo principal es conseguir un aro de luz o grabar de tarde; nunca se le prohíbe.
6. **Publicar ≠ grabar:** la hora de publicación sale de la auditoría (`mejor_hora_publicar`); si no hay, 18:00 de lunes a viernes.
7. **Recordatorios:** el día anterior a las 20:00 y 1 hora antes del bloque. El texto incluye qué va a grabar (lo toma de la parrilla). Si el aviso del día anterior cae dentro de un bloque (por ejemplo, dos días seguidos de noche), se manda al terminar ese bloque: "¡Bien! Mañana repites a las 19:00".
7B. **Luz según el momento:** de día usa la ventana; de noche, el aro de luz y las lámparas. Si mezcla aro y lámpara, que den el mismo tono (cálida o blanca).
8. **Revisión automática:** si falla 2 bloques seguidos, la app pregunta "¿te acomoda otro horario?" en lugar de regañar.
9. Consejos según lugar y luz (biblioteca fija): ventana de frente y no a la espalda; celular a la altura de los ojos; grabar todo el bloque en una sola sesión de vestuario; en exteriores, evitar el sol de mediodía; en oficina, grabar en el horario de menos ruido.

---

## 6. Ejemplos

### Ejemplo 1 — @blombito

**Entrada:** martes (noche, 1 h), jueves (noche, 1 h), domingo (mañana, 2 h, "a veces no puedo"); lugar: casa, oficina, exteriores, varía; luz: ventana, aro de luz y lámpara. Mejor hora para publicar según la auditoría: 18:00.

**Salida**
```json
{
  "skill_version": "horario-v1",
  "bloques": [
    { "tipo": "fijo", "dia": "M", "inicio": "19:00", "fin": "20:00" },
    { "tipo": "fijo", "dia": "J", "inicio": "19:00", "fin": "20:00" },
    { "tipo": "respaldo", "dia": "D", "inicio": "10:00", "fin": "12:00", "nota": "día extra cuando sí se pueda" }
  ],
  "horas_semana": 2,
  "horas_con_extra": 4,
  "sugerencia": "Tus días seguros suman 2 horas. Si puedes, alarga una de tus noches a 1 h 30; si no, el domingo es tu día extra para llegar a 4.",
  "publicar": { "hora": "18:00", "por_que": "Es cuando más seguidores tienes conectados" },
  "recordatorios": [
    { "cuando": "lunes 20:00", "texto": "Mañana grabas a las 19:00. Ten tu aro de luz cargado ✨" },
    { "cuando": "martes 18:00", "texto": "En una hora grabas. Llega con tu guion leído" },
    { "cuando": "miércoles 20:00", "texto": "Mañana grabas a las 19:00. ¿Ya tienes tu guion?" },
    { "cuando": "jueves 18:00", "texto": "En una hora grabas. ¿Lista para ponerle corazón?" },
    { "cuando": "sábado 20:00", "texto": "Si mañana puedes, es tu día extra: 2 horas con luz de ventana. Ten listos 2 o 3 outfits" },
    { "cuando": "si falta a un bloque", "texto": "No pasa nada. ¿Qué otro día de esta semana lo recuperas?" }
  ],
  "consejos": [
    "El domingo es tu día de producción: graba ahí lo que va frente a cámara con luz de ventana y cambia de outfit entre videos para que parezcan días distintos",
    "En tus noches de 1 hora graba un solo video, y llega con el guion ya leído (o usa el teleprompter de la app)",
    "De noche pon el aro de frente a la altura de tus ojos y la lámpara a un lado; que las dos den el mismo tono de luz"
  ],
  "mensaje": "Tu semana creativa: martes y jueves una hora en la noche, y el domingo como día extra cuando se pueda. Si un día no se puede, lo recuperas otro día de esa semana."
}
```

**Aprendido en la prueba:** primera versión con preguntas de una sola opción y sin explicación; se corrigió a introducción + selección múltiple + panel por día (momento y tiempo de cada día).

---

## 7. Historial de versiones
- **v1** (14 oct 2026): primera versión.
