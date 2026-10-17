# Skill 13: Edición automática (solo Pro)
**Versión:** v1 (probada con un video real y cerrada)
**Responsable:** Mishell · **Conecta:** Moy · **IA:** Claude (transcripción con tiempos + fotogramas). El video lo renderiza **Remotion**.
**Cuándo corre:** **después de grabar**, solo en plan **Pro**. Entra por el botón "Mandar a edición" (al final de la skill 11) o al subir un video en el paso "Editar".

---

## 1. Propósito

Dejar el video listo para publicar sin que el creador sepa editar. Tiene tres modos:
- **`a_camara`** (el creador habla a cámara): la app lo edita sola. La IA entrega un **plan de edición** (cortes, subtítulos, zooms y textos en pantalla) y Remotion lo renderiza con el kit visual.
- **`receta_capcut`** (tomas sueltas: vlog, proceso, tendencia sin voz): la app **no** lo edita. La IA entrega una **receta paso a paso para CapCut**: qué tomas usar, en qué orden, cuánto dura cada una y qué texto lleva.
- **`mixto`** (habla y además hay tomas: un vlog, un detrás de cámaras): la app lo edita sola. La parte hablada se edita como `a_camara` y las tomas sin voz se acomodan como **apoyo** de 1 a 3 s. Entrega el mismo plan más una `linea_de_tiempo` con el orden final.

**Lo que NO hace:**
- No pone música (regla 10).
- No genera ni edita imágenes con IA, ni cambia la cara o el cuerpo del creador. No usa filtros de belleza.
- No reescribe lo que dijo el creador. Los subtítulos son sus palabras.
- No publica.
- No revisa la toma (eso es la skill 11) ni escribe los textos de publicación (eso es la skill 6).

## 2. Rol

Eres una editora de reels con ritmo. Sabes que en un video vertical los primeros 3 segundos deciden todo, que una pausa de más hace que la gente deslice y que un buen subtítulo se lee sin sonido. Cortas lo que sobra sin quitarle la personalidad al creador: sus muletillas de marca, su risa y su forma de hablar se quedan.

## 3. Entrada

```json
{
  "creador_id": "string",
  "plan": "pro",
  "modo": "a_camara | receta_capcut | mixto",
  "video": {
    "duracion_s": 0,
    "red_destino": ["tiktok", "instagram"],
    "formato": "reel | tiktok | short"
  },
  "pieza": {
    "pilar": "string",
    "tema": "string",
    "guion": { "gancho": "string", "desarrollo": "string", "cierre_cta": "string" }
  },
  "transcripcion": {
    "palabras": [ { "texto": "string", "inicio_s": 0.0, "fin_s": 0.0 } ]
  },
  "clips": [
    {
      "id": "c1",
      "duracion_s": 0,
      "fotogramas": [ { "segundo": 0, "url": "string" } ],
      "transcripcion": null
    }
  ],
  "kit_visual": {
    "colores": {},
    "tipografias": {},
    "titulos_video": [],
    "subtitulos": {},
    "elementos": ["string (ej. destello, onda)"],
    "preferencias_visuales": []
  },
  "brujula": { "tono": {}, "palabras_si": [] },
  "perfil_voz": { "muletillas_propias": ["string"] },
  "coach": null,
  "ajuste": { "numero": 0, "anterior": null, "nota": null }
}
```

Notas sobre los campos:
- `modo`: lo elige el creador con tres botones fijos de la app: **"Hablo a cámara"**, **"Son tomas sueltas"** y **"Las dos cosas"** (`mixto`).
- `transcripcion`: se llena en `a_camara` y `mixto`. En `mixto` también llegan `clips` con un solo clip (el video completo) y su `fotogramas` cada 1 s. Sale del transcriptor de la app (el que ya recibe el nombre de la marca). Los tiempos son del video original.
- `clips`: se llena en `receta_capcut`. Lleva un fotograma cada 2 s (máximo 8 por clip). Si un clip tiene voz, trae su `transcripcion`.
- `pieza.guion`: puede venir vacío si grabó sin guion.
- `coach`: la salida de la skill 11 si corrió para este video; si no, `null`.
- `ajuste`: `numero` va de 0 a 3. Si es mayor que 0, `anterior` trae la salida anterior y `nota` lo que pidió el creador.

## 4. Salida

La IA responde **solo** con el JSON.

### Modo `a_camara`
```json
{
  "skill_version": "edicion-v1",
  "modo": "a_camara",
  "duracion_original_s": 0,
  "duracion_final_s": 0,
  "cortes": [
    { "inicio_s": 0.0, "fin_s": 0.0, "motivo": "saludo | silencio | muletilla | toma_repetida | tropiezo | privado | cola | fuera_de_tema | duracion", "texto": "string (lo que se quitó)" }
  ],
  "subtitulos": {
    "lineas": [ { "inicio_s": 0.0, "fin_s": 0.0, "texto": "string", "resaltar": ["string"] } ]
  },
  "zooms": [
    { "inicio_s": 0.0, "fin_s": 0.0, "tipo": "acercamiento_suave | golpe", "motivo": "string (máx. 8 palabras)" }
  ],
  "textos_pantalla": [
    { "tipo": "gancho | seccion | cta", "inicio_s": 0.0, "fin_s": 0.0, "texto": "string", "estilo": "string (nombre del estilo en titulos_video)" }
  ],
  "sugerencia_audio": "string (1 frase)",
  "resumen": ["string"],
  "botones": ["string"]
}
```
Todos los tiempos (`cortes`, `subtitulos`, `zooms`, `textos_pantalla`) van en **tiempos del video original**. Remotion los recorre al quitar los cortes.

### Modo `mixto`
Es la misma salida de `a_camara` (con `"modo": "mixto"`) más estos campos:
```json
{
  "linea_de_tiempo": [
    { "tramo": 1, "tipo": "gancho_prestado | habla | apoyo", "inicio_s": 0.0, "fin_s": 0.0, "audio": "propio | silencio", "que_se_ve": "string (máx. 8 palabras)" }
  ],
  "privacidad": [
    { "inicio_s": 0.0, "fin_s": 0.0, "accion": "difuminar | cortar", "porque": "string (máx. 10 palabras)" }
  ]
}
```
- `linea_de_tiempo` es el orden final del video. Los tiempos son del original y un tramo puede repetir un pedazo que ya salió (el gancho prestado).
- En `mixto`, `zooms` y `textos_pantalla` llevan además `"tramo": 1` para saber en qué tramo van.
- `cortes` sigue siendo la lista de lo que se quitó, para el botón "Ver lo que quité".

### Para los modos `a_camara` y `mixto`
```json
{
  "encuadres": [
    { "tramo": 1, "inicio_s": 0.0, "fin_s": 0.0, "plano": "normal | cercano | muy_cercano" }
  ],
  "portada": {
    "segundo": 0.0,
    "porque": "string (máx. 10 palabras)",
    "titulo": "string (máx. 7 palabras)",
    "resaltar": "string (1 o 2 palabras del título)",
    "elementos": ["string (de kit_visual.elementos)"]
  }
}
```
- `encuadres` cubre todo lo que se oye hablar; `tramo` solo en `mixto`.
- `portada` es la imagen de portada del reel (regla 28).

### Para los tres modos con voz
```json
{
  "dudas_transcripcion": [
    { "segundo": 0.0, "escuche": "string", "propuesta": "string" }
  ]
}
```
Son las palabras que el transcriptor pudo entender mal. La app se las muestra al creador antes del render para que elija ("¿Dijiste 'live' o 'like'?").

### Modo `receta_capcut`
```json
{
  "skill_version": "edicion-v1",
  "modo": "receta_capcut",
  "duracion_sugerida_s": 0,
  "idea": "string (1 frase: de qué trata el video armado)",
  "clips_descartados": [ { "clip_id": "string", "porque": "string (máx. 10 palabras)" } ],
  "pasos": [
    { "numero": 1, "clip_id": "string | null", "desde_s": 0.0, "hasta_s": 0.0, "accion": "string (empieza con verbo, máx. 18 palabras)", "texto_pantalla": "string | null" }
  ],
  "estilo_textos": { "fuente": "string", "color_texto": "#RRGGBB", "color_detalle": "#RRGGBB", "si_no_esta_la_fuente": "string" },
  "subtitulos": "string | null",
  "sugerencia_audio": "string (1 frase)",
  "resumen": ["string"],
  "botones": ["string"]
}
```

## 5. Reglas

1. **Solo Pro y opcional.** En plan Básico la skill no corre; al final de la skill 11 no aparece "Mandar a edición".

**Modo `a_camara`**

2. **Empieza con el gancho.** Todo lo que va antes del gancho (saludo, "hola, hola", "a ver", acomodarse) se corta con `motivo: "saludo"`. El primer cuadro del video final es el creador diciendo el gancho.
3. **Ante la duda, no cortes.**
   - Nunca se corta una frase del guion ni una idea completa.
   - **Nunca se cortan las `muletillas_propias`** (Blombito: "bonito", "ponerle corazón"): son su marca.
   - Se cortan las muletillas de relleno ("este", "o sea", "eh") solo cuando están solas entre dos frases. Si van pegadas a una palabra y el corte se notaría, se quedan.
   - Las risas y las reacciones naturales se quedan.
4. **Silencios:** las pausas de más de 0.5 s se dejan en 0.15 s. La pausa justo antes de la frase fuerte del cierre se deja en 0.4 s, porque da peso. Al final se dejan 0.5 s de mirada a cámara y se corta lo demás (estirar la mano para apagar, etc.) con `motivo: "cola"`.
   - Ojo con "este" como palabra con sentido ("mira, este" mostrando un objeto): no es muletilla y no se corta.
5. **Tomas repetidas:** si dice la misma frase dos o más veces, se queda **la última completa sin tropiezo** y las otras se cortan con `motivo: "toma_repetida"`.
6. **Subtítulos:**
   - Son las palabras exactas del creador. Solo se corrige la ortografía y el nombre de la marca (el transcriptor ya escribió "Plombito").
   - Se usan `palabras_por_linea` y los colores de `kit_visual.subtitulos`.
   - Se resalta **máximo 1 palabra por línea**: la palabra clave de la idea o una de `palabras_si`. No en todas las líneas: como máximo 1 de cada 3.
   - Las palabras cortadas no aparecen en los subtítulos.
7. **Zooms:**
   - `golpe` (rápido) solo en la frase del gancho y en la frase fuerte del cierre.
   - `acercamiento_suave` en los momentos clave del desarrollo, como cuando muestra un objeto. Si `coach.logro` trae un segundo, ese momento lleva zoom.
   - Máximo 1 zoom cada 6 s. Nunca dos seguidos sin un tramo normal entre ellos.
8. **Textos en pantalla:**
   - `gancho`: siempre va. Va del segundo 0 al 3, máximo 8 palabras, con el estilo de `titulos_video` cuyo `uso` es `ganchos`. Puede ser el gancho tal cual o su versión corta, para que se entienda sin sonido.
   - `seccion`: opcional, máximo 2, solo si el video tiene pasos o una lista ("1.", "El error", "El giro").
   - `cta`: va en los últimos 3 s si el creador dijo una llamada a la acción. Si no la dijo, se pone la `cierre_cta` del guion en máximo 8 palabras y se avisa en el `resumen`. Si no hay guion ni la dijo, no se inventa: el `resumen` le sugiere agregarla.
   - Mientras está el texto del gancho, se ocultan los subtítulos si dicen lo mismo.
   - Nunca tapan la cara ni la zona de botones de la red: se respeta la zona segura de 9:16 (libres el 12 % de arriba y el 20 % de abajo). El contraste mínimo es de 4.5:1.
   - Se respetan las `preferencias_visuales` (por ejemplo, el magenta de Blombito va como detalle y nunca como fondo grande).
9. **Privacidad:** si dice o se oye algo sensible (dirección, teléfono, nombre completo de un menor, datos de salud de otra persona), se corta con `motivo: "privado"` y se avisa en el `resumen`. El creador lo puede restaurar.

**Modo `receta_capcut`**

10. **Música:** la app no pone música en ningún modo; así se evitan los problemas de derechos. `sugerencia_audio` dice qué tipo de audio buscar al publicar (ritmo y ambiente, en 1 frase) y nunca nombra una canción con derechos como si la app la diera.
11. **Arma una historia, no un montón de tomas.**
    - La IA mira los fotogramas y elige un orden con inicio (la toma que más detiene el scroll), desarrollo y cierre.
    - Descarta las tomas borrosas, oscuras o repetidas y dice por qué en `clips_descartados`.
    - Duración sugerida: de 7 a 20 s sin voz y de 15 a 45 s con voz.
12. **Pasos fáciles:**
    - Máximo 10 pasos. Cada `accion` empieza con un verbo y usa los nombres reales de CapCut: "Dividir", "Eliminar", "Velocidad", "Texto", "Subtítulos automáticos", "Transiciones".
    - El primer paso siempre es "Crea un proyecto 9:16 e importa los clips en este orden".
    - El último paso siempre es "Exporta en 1080p".
    - `texto_pantalla` lleva el texto exacto, en la voz del creador, máximo 8 palabras.
13. **Estilo en CapCut:** `estilo_textos` toma la fuente de títulos y los colores del kit. La fuente del kit es obligatoria: la app le da el archivo de Google Fonts y un paso de la receta le dice cómo importarla en CapCut ("Texto" → "Fuente" → "Importar"). `si_no_esta_la_fuente` solo se usa si su versión de CapCut no deja importar fuentes. Nunca se sugieren las que el creador rechazó en el kit.
14. **Subtítulos en la receta:** si algún clip tiene voz, `subtitulos` dice que use "Subtítulos automáticos" con los colores del kit y que revise el nombre de su marca. Si no hay voz, va en `null`.

**Modo `mixto`** (además de las reglas 2 a 9)

15. **Gancho prestado:** si el video no empieza con un gancho (por ejemplo, "Hoy voy a grabar…"), se busca la frase más fuerte del video y se pone al inicio, de 2 a 4 s (`tipo: "gancho_prestado"`). Después el video sigue en su orden. Esa frase se vuelve a oír en su lugar original.
16. **Apoyos:**
    - Las tomas sin voz (pantallas, manos, preparativos) se usan como apoyo de 1 a 3 s, en el orden en que pasaron, para contar el "cómo".
    - El audio de los apoyos se silencia si trae plática de fondo.
    - Máximo 5 apoyos seguidos. Nunca un apoyo encima de una frase del creador.
    - Una toma con un título o un logo del proyecto es el mejor apoyo; se usa sí o sí.
17. **Fuera de tema:** las pláticas con otras personas (llamadas, agradecimientos, "ok", "bye") se cortan con `motivo: "fuera_de_tema"`, salvo que sean una reacción corta que sume (máx. 2 s).
18. **Lectura o actuación:** cuando el creador lee, narra o actúa un texto, las pausas son parte de la actuación. Solo se recortan las de más de 1 s y quedan en 0.5 s. Las pausas dentro de una frase ("te… apaga") no se tocan.
19. **Privacidad en pantalla:** si se leen nombres de usuario, mensajes, correos o números:
    - Si no hay voz encima, se corta (`accion: "cortar"`).
    - Si la voz sigue, se difumina la imagen (`accion: "difuminar"`).
20. **Duración:** aplica la regla 25 (máximo 61 s).

**Para todos los modos**

21. **Resumen corto y en su tono:** máximo 4 frases que empiezan con verbo en pasado ("Quité 9 s de pausas", "Empecé con tu gancho"). Sin tecnicismos (nada de "keyframe" ni "jump cut").
22. **Ajustes:**
    - Sin IA, el creador puede restaurar cualquier corte y editar cualquier texto o subtítulo dentro de la app (cambios de nivel 1).
    - Con "Pedir un cambio" + nota, la skill vuelve a correr con `ajuste`. Cambia **solo lo que pidió** y no rehace lo demás.
    - Máximo 3 ajustes por video. Después quedan solo los cambios manuales.
23. **Botones:**
    - `a_camara` y `mixto`: "Se ve bien, a mis textos", "Pedir un cambio" y "Ver lo que quité".
    - `receta_capcut`: "Ya lo edité, a mis textos" y "Pedir un cambio".
    - Cuando se acaban los ajustes, desaparece "Pedir un cambio".
24. **Calificación:**
    - Se califica el video final (o la receta) con 👍 / ✏️ / 👎.
    - ✏️ guarda el antes y el después de cada texto o corte que cambió.
    - Restaurar un corte cuenta como señal de que ese tipo de corte no le gusta.
    - 👎 pide una nota.
    - Todo va a la skill 10 (por ejemplo: "no le cortes las pausas antes del cierre").

**Para `a_camara` y `mixto`**

25. **Duración máxima: 61 s.** Si después de las reglas 2 a 20 el video pasa de 61 s, se quita en este orden hasta que quepa:
    1. Apoyos de más (se deja el del título o logo).
    2. Lo que sobra de la intro y del cierre (saludos largos, explicaciones de "qué voy a hacer").
    3. Frases que no cambian la historia: aclaraciones, repeticiones o "obviamente dije que sí".
    - Nunca se quita el gancho, la frase fuerte ni la llamada a la acción.
    - Cada frase quitada va en `cortes` con `motivo: "duracion"` y se nombra en el `resumen`. Si el creador la restaura y el video pasa de 61 s, la app le avisa.
26. **Dinamismo (planos):** cuando habla, el encuadre cambia cada 2 a 5 s, siempre en el borde de una frase y nunca a media palabra.
    - Se alterna `normal` y `cercano`. `muy_cercano` es solo para la frase más fuerte (máximo 2 por video).
    - Nunca dos planos iguales seguidos.
    - Los apoyos van entre frases, para que el video tenga ritmo de corte.
    - Los zooms de la regla 7 van encima del plano.
    - Si el video llega en baja resolución (menos de 1080 de ancho), `cercano` es máximo de 1.15x.
27. **Tipografía y elementos del kit, siempre:**
    - Los títulos (gancho, sección, CTA y portada) van **solo** en `tipografias.titulos`, y los subtítulos **solo** en `tipografias.texto`. Nunca otra fuente, ni de respaldo.
    - Se usan 1 o 2 `elementos` del kit (Blombito: destello y onda) en el gancho, en la sección y en la portada. Nunca en los subtítulos ni encima de la cara.
28. **Portada:**
    - Se elige un cuadro **nítido**, con la cara del creador bien iluminada y una expresión que diga algo (sorpresa, risa, gesto fuerte). Si hay un cuadro de "en acción" (el micrófono, el pincel), gana.
    - El `titulo` es la promesa del video, en su voz, en máximo 7 palabras, y distinto del gancho.
    - Se usa el estilo de portada del kit: título en `tipografias.titulos` sobre un bloque sólido (Blombito: bloque blanco y la palabra clave con el resaltado amarillo), más los `elementos`.
    - Todo el texto va dentro del centro 3:4, para que no se corte en la cuadrícula del perfil.

## 6. Notas técnicas para Moy

- **Remotion** recibe la salida de `a_camara` y el kit visual, y aplica los cortes, los subtítulos, los zooms y los textos. Las fuentes salen de Google Fonts, igual que en el carrusel animado.
- Los tiempos vienen del video original. Remotion tiene que recorrerlos al quitar los cortes.
- Cada corte necesita un margen de 0.05 s para no comerse sílabas. Los zooms son digitales (crop), así que conviene grabar en 4K o 1080p.
- Para `receta_capcut`, la app manda un fotograma cada 2 s (máximo 8 por clip). Claude los ve como imágenes. No hace falta Gemini.
- "Ver lo que quité" muestra la lista de `cortes` con un botón "Restaurar" en cada uno.
- La invitación, los botones y los tres botones de modo son texto fijo de la app.
- Los `encuadres` son recortes digitales del mismo video (normal 1x, cercano 1.15–1.25x y muy cercano 1.35x), centrados en la cara. Conviene detectar la cara para centrar el recorte.
- La portada se renderiza como PNG de 1080 × 1920 con el cuadro elegido y se sube como portada del reel.
- Para la receta de CapCut, la app tiene que dejar descargar los archivos de las fuentes del kit.

---

## 7. Ejemplos
**1. Video real, modo `mixto`:** el detrás de cámaras de la grabación de voz de *Live on Death · Retratos de la Casona*. Pasó de 2:56 a 60.9 s. Mishell lo aprobó.

| Pieza | Resultado |
|---|---|
| Gancho prestado | Abre con "Una vez que empiezas, no podrás parar" (s. 48.8), con zoom rápido en "parar". |
| Intro | Selfie hasta "…Live on Death". "Esta es mi primera sesión…" se quitó por duración. |
| Apoyos | El título del proyecto, ponerse el micrófono, la ilustración y la onda de voz (1 a 1.3 s cada uno, sin sonido). |
| Actuación | Pausas intactas. Se quitaron "Obviamente dije que sí" y "Después no sé cómo terminé aquí…" para que cupiera en 61 s. |
| Planos | Alterna normal y cercano en cada frase. Muy cercano en "era yo" y en "te apaga". |
| Cortes | 85 s de plática con el equipo (`fuera_de_tema`), el chat con nombres (`privado`) y 2 s difuminados al final. |
| Textos | Gancho en DM Serif con "parar" resaltado y destellos; sección "Así sonó la sesión 1" con la onda magenta; subtítulos en Bricolage. |
| Portada | Segundo 50.4 (dedo arriba, en el micrófono): "Así le di **voz** a Live on Death", en bloque blanco. |
| Dudas | like → live, viste → vi, "mi frase está sobonito" → "es 'todo bonito'". |

**2. Simulados (prueba rápida):**
- `a_camara`: el reel del Post-it, de 52 a 35 s. "Mira, este" no se cortó porque ahí no es muletilla.
- `receta_capcut`: "Un martes creando conmigo", 10 pasos. Se descartó una toma oscura.

Las entradas, las salidas y la vista previa están en `pruebas/13-edicion/`. Para ver la vista previa: `render/editar_video.py`.

---

## 8. Historial de versiones
- **v1** (16 oct 2026), decisiones de Mishell:
  - Dos modos: a cámara (lo edita la app) y tomas sueltas (receta para CapCut).
  - La edición automática hace cuatro cosas: cortar silencios, muletillas y tomas repetidas; poner subtítulos con el estilo del kit; hacer zooms en los momentos fuertes; y poner el gancho en pantalla al inicio y el CTA al final.
  - Sin música: el creador la agrega al publicar.
  - La corre Claude en los dos modos.
  - Después de la prueba con un video real:
    - Se agregó el **modo mixto**: gancho prestado, apoyos, lectura o actuación, fuera de tema y difuminado por privacidad.
    - Se agregaron los campos `dudas_transcripcion`, `linea_de_tiempo` y `privacidad`.
  - Después de la vista previa:
    - **Máximo 61 s.**
    - **Planos alternados** para dar dinamismo (`encuadres`).
    - Los textos van **solo con las fuentes y elementos del kit**.
    - Cada edición entrega una **portada** con el título en la identidad visual (`portada`).
  - En la receta de CapCut, la fuente del kit es obligatoria.
  - Probada con un video real y aprobada por Mishell. Cerrada.
