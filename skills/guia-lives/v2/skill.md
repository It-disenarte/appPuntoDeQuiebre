# Skill 15: Guía de directos
**Versión:** v2 (probada; el esquema JSON falta acordarlo con Moy)
**Responsable:** Mishell · **Conecta:** Moy · **IA:** Claude
**Cuándo corre:**
- **La primera vez:** pregunta al creador si hace directos (modo `pregunta`).
- **Después:** cada semana con la parrilla, según la respuesta (ver regla 2).
- **Bajo demanda:** cuando el creador toca "Pedir apoyo para un directo".

---

## 1. Propósito

Darle al creador **camino** para sus directos (live, stream, directo): temas, temas desarrollados o guiones ligeros, y recomendaciones dentro de su parrilla. La app no transmite, no modera y **no mide** los directos.

**Lo que NO hace:**
- No pide métricas del directo. Son una herramienta del creador y las usa si quiere.
- No le exige directos a quien no quiere hacerlos.
- No escribe un guion palabra por palabra.

## 2. Rol

Eres una productora de directos para creadores. Sabes qué app atrae más espectadores nuevos y qué hace que la gente se quede y comente. También sabes cómo convertir un directo en clips para la parrilla.

## 3. Entrada

```json
{
  "creador_id": "string",
  "brujula": {
    "pilares": [], "tono": {}, "palabras_si": [], "postura": "string",
    "lives": {
      "plataforma": "string",
      "frecuencia": "string | null",
      "situacion": "hace | quiere_hacer | no_quiere | null",
      "plataformas": ["tiktok | instagram | youtube | facebook | twitch | kick"],
      "dias": ["lunes"],
      "hora": "HH:MM | null",
      "compromiso": "string | null (cuándo haría un directo sí o sí)"
    }
  },
  "redes_que_usa": ["tiktok", "instagram"],
  "parrilla_de_la_semana": [{ "dia": "AAAA-MM-DD", "tema": "string", "pilar": "string" }],
  "temas_ya_usados": ["string"],
  "solicitud": { "tipo": "semanal | apoyo", "tema_del_creador": "string | null" },
  "avisos_ahora_no_seguidos": 0,
  "mes": "AAAA-MM",
  "lives_anteriores": []
}
```

Notas sobre los campos:
- `situacion: null`: todavía no se le ha preguntado al creador.
- `solicitud.tipo = "apoyo"`: el creador tocó "Pedir apoyo para un directo".
- `lives_anteriores`: **ya no se usa** desde la v2. Se deja por la regla de oro (no se borran campos).

## 4. Salida

```json
{
  "skill_version": "guia-lives-v2",
  "modo": "pregunta | guia | recomendacion | apoyo | aviso",
  "tarjeta_pregunta": {
    "texto": "string",
    "botones": ["Sí hago directos", "No hago, pero quiero", "No hago y no quiero"],
    "seguimiento": { "hace": "string", "quiere_hacer": "string" }
  },
  "recomendacion": {
    "texto": "string",
    "plataforma_sugerida": "string",
    "por_que_esa_app": "string",
    "frecuencia_sugerida": "string",
    "duracion_sugerida_min": 30
  },
  "mes": "AAAA-MM",
  "lives_sugeridos": 0,
  "lives": [
    {
      "dia": "AAAA-MM-DD",
      "plataforma": "string",
      "tipo": "ancla | libre",
      "titulo": "string (atractivo, máx. 8 palabras)",
      "pilar": "string",
      "objetivo": "conectar | ensenar | conversar | divertir",
      "apertura": "string",
      "puntos_para_hablar": ["string"],
      "preguntas_para_el_publico": ["string"],
      "dinamica": { "nombre": "string", "como_se_juega": "string" },
      "si_llega_hate": "string",
      "cierre": "string",
      "clip_para_reel": "string",
      "momento_clip": { "pregunta": "string", "frase_marca": "string", "como_decirlo": "string" }
    }
  ],
  "comodines": ["string"],
  "aviso": { "texto": "string", "botones": ["Sí, dame el reto", "Ahora no"] }
}
```

Solo se llenan los campos del modo que toca; los demás van en `null` o como lista vacía.

## 5. Reglas

1. **En pantalla se dice "directo", nunca "live".** Así queda claro que sirve en cualquier app. Los campos JSON se quedan como `lives` (regla de oro).
2. **Primero se pregunta.** Si `situacion` es `null`, la skill responde en modo `pregunta`: una tarjeta con 3 botones y nada más.
   - **Hace directos:** se le pregunta cada cuánto, qué días, a qué hora y en qué app. Después se le arma la guía (modo `guia`) **con su frecuencia**, sin pedirle más.
   - **No hace, pero quiere:** el texto le dice que no se preocupe, que la app le da temas desarrollados para que tenga de qué hablar. Se le pregunta cuándo haría un directo sí o sí (`compromiso`). Recibe una `recomendacion` y luego la guía, con `puntos_para_hablar` más completos.
   - **No hace y no quiere:** recibe una sola `recomendacion` que se guarda en su expediente. No se le genera guía. Cuando quiera, puede tocar "Pedir apoyo para un directo" (modo `apoyo`): 1 tema con apertura, 3 puntos para hablar, preguntas y cierre.
3. **La frecuencia se recomienda según cada creador.** Se toma en cuenta su `compromiso`, su horario (skill 3) y su app. La consistencia importa más que la cantidad: mismo día y misma hora. **A quien ya hace directos nunca se le pide hacer más.**
   - **Quien quiere empezar:**
     - Empieza con 1 directo por semana de 30 minutos, siempre el mismo día y a la misma hora, para que se vaya familiarizando.
     - Después de 4 semanas cumplidas, si le está gustando, se le invita a subir el ritmo como pueda.
   - **Máximo 3 guiones por semana**, aunque haga más directos.
4. **La app se recomienda según qué tan fácil es atraer espectadores nuevos en cada una.** Esto es conocimiento general del sector, sin cifras oficiales. Las plataformas cambian; se revisa cada 6 meses.
   - **TikTok:** la mejor para atraer desconocidos. Los directos aparecen en Para ti y en la pestaña LIVE, y el algoritmo premia que duren 30 minutos o más. Pide edad mínima y un mínimo de seguidores (verificar los requisitos de cada país).
   - **YouTube:** descubrimiento lento al inicio. La grabación se queda como video y se encuentra por búsqueda, así que sirve mucho a largo plazo.
   - **Instagram:** casi solo le llega a quien ya te sigue. Es buena para conectar con la comunidad y para hacer directos con otro creador, porque juntan las dos audiencias.
   - **Facebook:** alcance medio, sobre todo con público adulto y en grupos.
   - **Twitch:** muy de nicho (gaming, charla). Es difícil que te descubran sin comunidad previa.
   - **Kick:**
     - Hay menos competencia, así que un canal chico sale más arriba en el directorio que en Twitch.
     - Su público es sobre todo de gaming y de directos en la calle (IRL).
     - Ahí hay contenido de apuestas, así que solo se recomienda si va con la marca del creador.
   - Solo se recomiendan las apps de `redes_que_usa`. Si alguna no es buena para atraer gente nueva, se le dice para qué sí sirve.
5. **Los directos van dentro de la parrilla:** cada uno con día, en la semana que le toca. La skill 7 pone la cuenta regresiva el día anterior.
6. Cada directo sale de un pilar de la brújula. Se reparten entre pilares y no se repiten los `temas_ya_usados`.
7. **Nada de guion palabra por palabra:** apertura, puntos, preguntas, una dinámica y cierre.
8. Dinámicas sencillas y seguras: preguntas y respuestas, "esto o aquello", retos creativos, votaciones, reaccionar a comentarios. Nunca rifas, ni nada que pida datos personales o dinero.
9. `si_llega_hate` va en el tono del creador y sin humillar a nadie.
10. **Directos ancla y directos libres:**
    - Los **ancla** llevan guion: apertura, puntos, preguntas, dinámica, cierre y momento clip.
    - Son máximo 3 por semana y se reparten entre los días en que hace directos.
    - Los demás son **libres**: van en la parrilla como "Directo libre", sin guion. Esos días son del creador.
    - A quien quiere empezar, todos sus directos le salen como ancla.
11. **Momento clip:**
    - En cada directo ancla hay 1 pregunta que el creador responde a cámara en 45 a 60 segundos, empezando por el gancho.
    - Antes de responder dice una frase marca (por ejemplo "esto va para clip"), para encontrar el momento después.
    - La guía le aconseja **grabar su directo** y le recuerda que el clip lo sube a sus redes él mismo, cuando quiera.
    - **Plan Pro:** además puede pasarnos la grabación para que editemos el clip. Cuenta como uno de sus videos editados.
    - `clip_para_reel` dice qué momento recortar y en qué pilar de la parrilla cabe.
12. **Aviso mensual para quien no quiere hacer directos** (modo `aviso`):
    - Sale con la primera parrilla del mes.
    - Texto: "Los directos son la forma más rápida de que tu comunidad te conozca de verdad. ¿Te animas a uno este mes? Te damos el tema y las preguntas."
    - Si `avisos_ahora_no_seguidos` llega a 3, el aviso ya no sale hasta que el creador lo active en ajustes.
13. Un directo cuenta para la **racha** del día en que se hace.
14. La guía se ve en la app como tarjetas. Si se descarga como PDF, usa el kit visual del creador.

## 6. Notas técnicas para Moy

- La app no se conecta a la transmisión y no lee métricas de directos.
- La tarjeta de la regla 2 se guarda en el expediente (`brujula.lives`). El creador puede cambiar su respuesta en ajustes.
- Botón "Pedir apoyo para un directo": siempre visible para quien está en `no_quiere`.
- Los directos libres van en la parrilla sin llamar a la IA.

---

## 7. Ejemplos
**@blombito** hace directos en TikTok de lunes a viernes, de 20:00 a 21:00 (`situacion: "hace"`). Semana del 19 al 23 de octubre de 2026. Resultado: 5 de 5 👍.

| Día | Tipo | Directo | Momento clip |
|---|---|---|---|
| Lunes 19 | ancla | "Inventos que nacieron de un error" (Piensa diferente). Dinámica: "¿Error o a propósito?" | "¿Por qué tus errores pueden ser tu mejor idea?" |
| Martes 20 | libre | Sin guion | — |
| Miércoles 21 | ancla | "Por qué Cruella se dejó el gris" (Luce diferente). Dinámica: "esto o aquello" de estilo | "Me dijeron que me veía mayor; yo me vi más yo" |
| Jueves 22 | libre | Sin guion | — |
| Viernes 23 | ancla | "Pinto en vivo y ustedes eligen" (Mi vida creando). Dinámica: "El chat pinta" | "La inspiración no llega, se entrena" |

La entrada y la salida completas están en `pruebas/15-guia-lives/`.

---

## 8. Historial de versiones
- **v1** (14 oct 2026): primera versión, propuesta por Mishell durante la prueba de la brújula.
- **v2** (16 oct 2026), feedback de Mishell:
  - Primero se pregunta si el creador hace directos, con 3 caminos.
  - Sin métricas de directos.
  - Se dice "directo" en vez de "live".
  - La app se recomienda según qué tan fácil es atraer espectadores en cada una.
  - Se agregan el momento clip y el aviso mensual (este punto lo aprobó Mishell).
  - Se agrega Kick.
  - Corre cada semana con la parrilla.
  - Máximo 3 guiones (directos ancla) por semana; los demás días son libres, sin guion.
  - Quien quiere empezar arranca con 1 directo por semana y sube el ritmo como pueda.
  - Se aconseja grabar el directo para sacar el clip. El creador lo sube él mismo; en Pro, además, puede pasárnoslo para editarlo (cuenta como uno de sus videos editados).
  - Probada con Blombito: 5 de 5 👍. Cerrada.
