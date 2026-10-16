# Skill 7: Ideas de historias
**Versión:** v2 (sin prueba con Blombito · esquema JSON pendiente de acordar con Moy)
**Responsable:** Mishell · **Conecta:** Moy · **IA:** biblioteca fija + Claude para adaptar
**Cuándo corre:** una vez por semana, junto con la parrilla del analizador (14); la app manda la idea de cada día por la mañana.

---

## 1. Propósito

Darle al creador **una idea de historia por día que se haga en menos de 5 minutos**, para que mantenga la racha (una historia al día la cumple) y para que su comunidad interactúe. Las historias se acomodan a lo que pasa en su semana: si graba, si publica o si tiene live.

## 1B. Introducción (la primera vez)

> **Tus ideas de historias**
> Cada día te vamos a dar una idea distinta para tus historias, que se hace en menos de 5 minutos y te ayuda a mantener tu racha.
> Pero recuerda: **son solo sugerencias**. Si ese día haces algo extraordinario, algo que te emocionó o que quieres compartir, ¡compártelo! Tu vida real siempre va primero, y también cuenta para tu racha.
> Y un día a la semana **la idea es tuya**: tú la escribes, así vas entrenando tu ojo creativo y la app aprende de ti.
>
> [De acuerdo]

## 1C. De qué quiero que hablen mis historias (cada semana)

Cada semana, cuando sale su parrilla, el creador decide el enfoque de sus historias. Es una tarjeta que se contesta en menos de 2 minutos.

1. **"¿De qué quieres que hablen tus historias esta semana?"**
   - Elige de 1 a 3 temas.
   - Los botones salen de sus pilares y de lo que más repitió en sus ideas propias (regla 5B).
   - También tiene "Otro" por voz.
2. **"¿Algo que ya no quieras ver?"** (opcional): puede apagar tipos de la biblioteca por 4 semanas.
3. **"Así te fue"** no va aquí. Esas tarjetas de lo que funcionó salen junto con la entrega de métricas (skill 9, quincenal). Su forma depende de lo que se decida con Moy sobre las métricas.

## 2. Por qué biblioteca + Claude

Los tipos de historia son pocos y se repiten, así que viven en una **biblioteca fija** (sin costo). Claude solo **adapta** cada tipo al nicho, a la parrilla de la semana y a la voz del creador.

**Biblioteca de tipos**
| Tipo | Sticker de Instagram | Cuándo sirve |
|---|---|---|
| Detrás de cámaras | — | Días de grabación |
| Nuevo reel | Enlace / mención al reel | Días de publicación |
| Encuesta | Encuesta | Cualquier día; sirve para elegir temas |
| Esto o aquello | Encuesta | Días ligeros |
| Caja de preguntas | Preguntas | 1 vez por semana |
| Slider de emoji | Barra deslizante | Días de rutina (gym, trabajo) |
| Dato curioso | — | Complementa un reel |
| Recomendación | — | Lo que lee, escucha o usa |
| Mi día en 3 fotos | — | Fines de semana |
| Reaccionar a un comentario | — | Después de un reel con comentarios |
| Cuenta regresiva | Cuenta regresiva | Antes de un live |

## 3. Entrada

```json
{
  "creador_id": "string",
  "brujula": { "pilares": [], "palabras_si": [], "lives": {} },
  "perfil_voz": { "frases_firma": [], "preferencias_aprendidas": [] },
  "horario": { "bloques": [] },
  "parrilla_semana": [{ "dia": "L-D", "tipo": "reel | carrusel", "tema": "string", "publica": "HH:MM" }],
  "historial": [{ "tipo": "string", "le_gusto": true }],
  "enfoque_semana": {
    "temas": ["string (1 a 3, los que eligió en la tarjeta 1C)"],
    "tipos_apagados": [{ "tipo": "string (de la biblioteca)", "hasta": "AAAA-MM-DD" }]
  }
}
```

## 4. Salida

```json
{
  "skill_version": "ideas-historias-v2",
  "temas_boton": ["string (3 a 5 opciones para la tarjeta 1C de la próxima semana)"],
  "semana": [
    {
      "dia": "L | M | X | J | V | S | D",
      "tipo": "string (de la biblioteca)",
      "idea": "string (qué subir, en una o dos frases)",
      "texto_sugerido": "string (con la voz del creador)",
      "sticker": "string | null",
      "minutos": 2,
      "tema_enfoque": "string | null (el tema de enfoque_semana que usa, o null)",
      "alternativas": [{ "tipo": "string", "idea": "string", "texto_sugerido": "string", "sticker": "string | null" }]
    }
  ]
}
```

## 5. Reglas

1. **Una idea por día, de 2 a 5 minutos.** Nada que pida grabar un video completo.
2. **Se acomoda a su semana:** día de grabación → detrás de cámaras; día de publicación → nuevo reel; antes de un live → cuenta regresiva.
3. **Mínimo 3 historias con sticker a la semana** (encuesta, preguntas, slider): son las que más interacción dan.
4. **Una encuesta a la semana alimenta la parrilla:** su resultado se manda al analizador como tema votado por su comunidad.
5. **"Otra idea" hasta 20 por día:** las 2 primeras están pensadas para lo que pasa ese día; las otras 18 salen de una biblioteca de 20 ideas adaptadas a su nicho, **en distinto orden cada día** para que no vea siempre las mismas. Al llegar a la 20 vuelve a la primera.
5B. **Un día a la semana, la idea es suya:** ese día no hay sugerencia; el creador escribe su propia idea con 3 preguntas guía (¿qué vas a mostrar?, ¿qué vas a decir o preguntar?, ¿usarías un sticker?), mínimo 15 palabras. La skill le da una retroalimentación corta y amable, y guarda la idea para aprender qué le nace contar. Por defecto es su día extra o el fin de semana.
6. **Sin repetir el mismo tipo dos días seguidos.**
7. Textos con su voz y sus `preferencias_aprendidas`; diseño con su kit visual cuando haya texto en pantalla.
8. **Racha:** cualquier historia publicada ese día cumple la racha, aunque no sea la sugerida.
9. **Voto en tres niveles + editar:** 😞 No me late en absoluto · 😐 Más o menos · 🙂 Me gusta · ✏️ Editar el texto. La skill guarda cuántas ideas vio antes de elegir y lo que editó, y con eso aprende qué tipos y qué tono prefiere.
10. **Dos modos**, igual que los textos (6): las primeras 2 semanas se pide el voto; después la idea solo llega y el creador la usa o no. Si pide "otra idea" seguido, vuelve a preguntar.
11. **Enfoque de la semana (1C):**
   - **4 de cada 7 ideas** se enfocan en los `temas` de `enfoque_semana` y se marcan en `tema_enfoque`.
   - Las otras 3 siguen la regla 2 (grabación, publicación, live).
   - El día de su idea propia (5B) no cambia.
   - Si no eligió temas, todas siguen la regla 2.
12. **Tipos apagados:** no se sugieren, ni como alternativa, hasta la fecha `hasta`. Si un tipo apagado choca con la regla 2 (por ejemplo, cuenta regresiva antes de un live), se usa el tipo más cercano que siga prendido.
13. **Privacidad en "Otro":** si menciona algo íntimo (pareja, salud, familia), se respeta como tema. Pero nunca aparece escrito en `temas_boton` ni en un `texto_sugerido` sin que el creador lo ponga.
14. **`temas_boton`:** de 3 a 5 opciones cortas (máx. 4 palabras) para la tarjeta de la próxima semana, sacadas de sus pilares y de sus ideas propias. Nada sensible.

---

## 6. Ejemplos

### Ejemplo 1 — @blombito
*(Se completa con su prueba.)*

---

## 7. Historial de versiones
- **v1** (14 oct 2026): primera versión.
- **v2** (16 oct 2026): se agrega el apartado "De qué quiero que hablen mis historias" (1C).
  - Es **semanal**, junto con la parrilla, y el creador elige de 1 a 3 temas.
  - Puede apagar tipos de historia por 4 semanas.
  - 4 de cada 7 ideas siguen sus temas.
  - "Así te fue" se mueve a la entrega de métricas (skill 9).
  - Campos nuevos: `enfoque_semana` (entrada), `temas_boton` y `tema_enfoque` (salida). Reglas 11 a 14.
