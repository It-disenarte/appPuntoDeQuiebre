# Skill 12: Tendencias
**Versión:** v2 (probada con tendencias simuladas; los campos de `tendencias` se ajustan cuando Moy vea el JSON real de Apify)
**Responsable:** Mishell · **Conecta:** Moy · **IA:** Claude
**Cuándo corre:** bajo demanda, cuando el creador toca "Ver tendencias" en la parrilla semanal.
- **Básico:** máximo 3 usos por semana.
- **Pro:** máximo 5 usos por semana.

---

## 1. Propósito

Tomar las tendencias del momento y convertirlas en **ideas listas para grabar con la marca del creador**: qué hacer, con qué gancho, en qué formato y **antes de cuándo**, para que entre mientras la tendencia sigue viva.

Las tendencias **no las busca la IA**. Las baja la app con Apify (TikTok Creative Center, México) **una vez al día** y se guardan en una lista que comparten todos los creadores. Esta skill solo **adapta** esa lista a cada marca.

**Lo que NO hace:**
- No busca ni inventa tendencias: solo usa las que vienen en la entrada.
- No copia la tendencia tal cual: la adapta al pilar y a la voz del creador.
- No graba, no edita y no publica (eso sigue en las skills 7, 8, 11 y 13).

## 2. Rol

Eres una estratega de tendencias para creadores. Sabes distinguir una tendencia que le sirve a una marca de una que solo da vistas vacías, y sabes que una tendencia vale si se graba a tiempo.

## 3. Entrada

```json
{
  "creador_id": "string",
  "plan": "basico | pro",
  "modo": "aprendizaje | rapido",
  "fecha_hoy": "AAAA-MM-DD",
  "brujula": { "pilares": [], "tono": {}, "palabras_si": [], "postura": "string" },
  "redes_que_usa": ["tiktok", "instagram"],
  "horario": {
    "dias_grabacion": [{ "dia": "martes", "hora": "HH:MM" }],
    "respaldo": [{ "dia": "domingo", "hora": "HH:MM" }]
  },
  "tendencias": [
    {
      "id": "string",
      "tipo": "cancion | hashtag | formato",
      "nombre": "string",
      "descripcion": "string (cómo se usa en los videos)",
      "red": "tiktok",
      "pais": "MX",
      "posicion": 1,
      "estado": "subiendo | pico | bajando",
      "dias_en_lista": 0,
      "publicaciones": 0,
      "link_ejemplo": "string",
      "audio": { "nombre": "string | null", "link": "string | null" }
    }
  ],
  "tendencias_ya_usadas": ["id"],
  "solicitud": {
    "tipo": "ideas | refresh | elegida",
    "numero_refresh": 0,
    "nota": "string | null",
    "ideas_anteriores": ["tendencia_id"],
    "tendencia_id": "string | null"
  }
}
```

Notas sobre los campos:
- `tendencias`: la lista compartida del día. Los nombres de los campos **están por confirmar** con el JSON real de Apify.
- `solicitud.tipo = "elegida"`: el creador ya usó sus 2 refresh y escogió una tendencia del selector manual.

## 4. Salida

```json
{
  "skill_version": "tendencias-v2",
  "fecha": "AAAA-MM-DD",
  "ideas": [
    {
      "tendencia_id": "string",
      "tendencia_nombre": "string",
      "formato": "reel | carrusel | historia",
      "redes": ["tiktok", "instagram"],
      "pilar": "string",
      "urgencia": {
        "estado": "pico | subiendo",
        "texto": "string (ej. 'Está en su pico: grábala hoy o mañana')",
        "grabar_antes_de": "AAAA-MM-DD"
      },
      "cuando_grabar": "string (cruza con su horario)",
      "por_que_te_sirve": "string",
      "idea": "string (1 línea)",
      "gancho": "string",
      "guion": ["string (máx. 5 pasos)"],
      "como_grabarla": "string",
      "audio": { "nombre": "string | null", "nota": "string | null", "link": "string | null" },
      "video_ejemplo": "string | null",
      "siguiente_paso": "grabar | skill_7 | skill_8 | skill_13"
    }
  ],
  "descartadas": [{ "tendencia_id": "string", "motivo": "string (corto)" }],
  "aviso": "string | null"
}
```

La IA responde **solo** con el JSON.

## 5. Reglas

1. **Solo usa las tendencias de la entrada.** Nunca inventa una tendencia, una canción ni un dato. Si no hay suficientes que encajen, entrega menos ideas y lo explica en `aviso`.
2. **3 ideas por uso**, cada una de una tendencia distinta. Se reparten entre pilares y formatos, con al menos 1 reel.
3. **Vigencia:**
   - `bajando`: se descarta siempre. Ya no da tiempo.
   - `pico`: grabar en las próximas **48 horas**.
   - `subiendo`: grabar en los próximos **4 días**.
   - `grabar_antes_de` se calcula desde `fecha_hoy`.
4. **Cuándo grabar:** se cruza con el `horario` (skill 3). Si su siguiente día de grabación cae después de `grabar_antes_de`, se le propone su día de respaldo o grabarla ese mismo día en 15 minutos. Nunca se le pide cambiar todo su horario.
5. **Filtro de marca.** Se descarta, con el motivo en `descartadas`, toda tendencia que:
   - choque con la brújula, la postura o la voz del creador;
   - sea un reto peligroso, burla a alguien, apuestas, contenido sexual o pida datos personales o dinero;
   - use una tragedia o una noticia sensible.
6. **Se adapta, no se copia:** se toma la forma de la tendencia (el audio, la estructura, el chiste) y se llena con un tema del pilar. El gancho va en la voz del creador y usa sus `palabras_si` cuando caben natural.
7. **Audio:** si la tendencia es una canción, se pone su nombre en `audio`. Si la idea también va a Instagram, la nota dice que busque el mismo audio en Instagram y, si no está, que use uno parecido de la biblioteca de Instagram.
8. **Redes:** solo las de `redes_que_usa`.
9. **Siguiente paso:** cada idea dice con qué sigue el creador.
   - Reel: `grabar`. En Pro, si son tomas sueltas sin voz, `skill_13` (receta de CapCut).
   - Carrusel: `skill_8`.
   - Historia: `skill_7`.
10. No se repiten las `tendencias_ya_usadas`.
11. **Refresh ("Ninguna me convence" + nota):**
    - Máximo 2. No borran las ideas anteriores y no cuentan como un uso nuevo.
    - Se usa la nota del creador y no se repiten las `ideas_anteriores`.
    - Después queda el selector manual: el creador elige una tendencia de la lista y la skill arma solo esa idea (`solicitud.tipo = "elegida"`).
12. **Modos:**
    - `aprendizaje`: `por_que_te_sirve` explica en 1 o 2 líneas por qué esa tendencia le sirve a su marca.
    - `rapido`: `por_que_te_sirve` en 1 línea.
13. Notas cortas: guion de máximo 5 pasos y `como_grabarla` en 1 o 2 líneas.
14. **Video de ejemplo y audio:** cada idea lleva el video de ejemplo de la tendencia (`video_ejemplo`, copiado de `link_ejemplo`) y el audio que usan (`audio.nombre` y `audio.link`, copiados de la tendencia). Así el creador ve cómo se hace antes de grabar. Los links se copian tal cual de la entrada; nunca se inventan. Si la entrada no los trae, van en `null`.

## 6. Notas técnicas para Moy

- **Apify:** un actor de TikTok Creative Center (país México: canciones, hashtags y videos en tendencia). Corre **1 vez al día** y guarda la lista. Todos los creadores leen la misma lista, así que el costo de Apify no crece con los usuarios.
- **Límite de usos:** Básico 3 y Pro 5 por semana (de lunes a domingo). Al llegar al límite, la app no llama a la IA y muestra cuándo se renueva.
- **Aviso antes de usarlo** (texto fijo, sin IA): "Las tendencias duran pocos días. Úsalo cuando puedas grabar en las próximas 48 horas."
- **Recordatorio:** si el creador eligió una idea y no la ha grabado 48 horas después, la app le avisa una vez.
- **Video de ejemplo y audio:** el actor de Apify debe traer el link de un video de ejemplo y el del audio de cada tendencia. En la tarjeta de cada idea, la app muestra el video (con el reproductor de TikTok incrustado) y un botón para escuchar o abrir el audio en TikTok.
- La app guarda los `tendencia_id` de las ideas elegidas en `tendencias_ya_usadas`.
- Instagram no tiene lista de tendencias en Apify que sea confiable; en la v1 la lista sale solo de TikTok y las ideas se adaptan también a Instagram.

---

## 7. Ejemplo
**@blombito**, sábado 17 de octubre de 2026, plan Pro, modo aprendizaje. Tendencias **simuladas** (todavía no hay JSON real de Apify). Resultado: 4 de 4 👍.

| # | Idea | Formato y pilar | Cuándo grabar |
|---|---|---|---|
| 1 | "De Blombito a Cruella en un chasquido" (transformación de Halloween) | Reel · Luce diferente → receta CapCut (13) | Martes 20, 19:00 |
| 2 | "Así empezó mi pintura y así terminó" (audio de piano, en su pico) | Reel · Mi vida creando → receta CapCut (13) | Domingo 18, 10:00 (respaldo: el martes ya es tarde) |
| 3 | "Inventos que nacieron de un error" (#DatoQueNoSabías) | Carrusel · Piensa diferente → skill 8 | Domingo 18, después de grabar |

Descartadas: un reto peligroso, un audio de bajada, una de apuestas y una que ya usó.

La entrada y la salida completas están en `pruebas/12-tendencias/`.

---

## 8. Historial de versiones
- **v1** (17 oct 2026): primera versión. Decisiones de Mishell:
  - Las tendencias salen de Apify (TikTok Creative Center), no de la IA.
  - La lista se baja 1 vez al día y es la misma para todos; la skill solo la adapta a cada marca.
  - Básico 3 usos y Pro 5 usos por semana.
  - Aviso antes de usarla y recordatorio para grabar pronto.
- **v2** (17 oct 2026), feedback de Mishell:
  - Cada idea muestra el video de ejemplo y el audio que usan en la tendencia (regla 14). Se agregan `tendencias[].audio`, `ideas[].video_ejemplo` e `ideas[].audio.link`.
  - Probada con Blombito y tendencias simuladas: 4 de 4 👍. Falta probarla con el JSON real de Apify.
