# Skill 1B: Kit visual
**Versión:** v1 (borrador — esquema JSON pendiente de acordar con Moy)
**Responsable:** Mishell · **Conecta:** Moy · **IA:** Claude
**Cuándo corre:** después de las tarjetas "Así te vemos" y las preguntas por voz; antes de la brújula.

---

## 1. Propósito

Que el creador elija, jugando, lo **mínimo** que la app necesita para que sus reels (Remotion) y carruseles se vean consistentes: 4 colores, 2 tipografías, estilo de títulos y estilo de subtítulos.

**No entrega:** logo, monograma, elementos gráficos diseñados a la medida, usos incorrectos ni área de seguridad. Eso es un servicio aparte. Sí incluye hasta 2 elementos simples de una biblioteca fija.

## 2. Cómo funciona (4 rondas + final)

| Ronda | Qué ve el creador | Qué elige |
|---|---|---|
| 1 | 2 paletas aplicadas a una portada de reel con su propio gancho | A o B |
| 2 | 4 variantes de la ganadora (cambia el acento o el fondo) | 1 de 4 |
| 3 | Su gancho escrito con 4 pares de tipografías | 1 de 4 |
| 4 | El mismo título con 4 estilos sobre video | 1 o 2 de 4 |
| 5 | Biblioteca de elementos simples pintados con su acento | Hasta 2 |
| Final | Reels y portadas de carrusel con sus propias fotos | 👍 o 👎 por pieza |

La skill se llama una vez por ronda (`modo: "ronda"`) y una vez al final (`modo: "final"`).

**Si no le gusta ninguna opción:** cada ronda tiene el botón "Ninguna me convence", con una caja de nota opcional (texto o voz: "¿qué no te gustó?"). La app vuelve a llamar la skill con `refresh` y genera opciones nuevas. **Máximo 2 refresh por ronda**; después, la app muestra un selector manual corto (lista de colores o tipografías) para que el creador no se quede atorado.

## 3. Entrada

```json
{
  "modo": "ronda | final",
  "numero_ronda": 1,
  "creador_id": "string",
  "auditoria": {
    "visual_detectado": { "colores": [], "consistencia": "string" },
    "tono_detectado": { "adjetivos": [] }
  },
  "respuestas_tarjetas": [
    { "id": "t1", "respuesta": "si | no | ajustar", "nota": "string | null" }
  ],
  "tono_elegido": ["string"],
  "gancho_muestra": "string (una frase suya, sacada de la auditoría o de la voz)",
  "elecciones_previas": [
    { "ronda": 1, "eligio": "A", "opcion": {} }
  ],
  "calificaciones_revelacion": [
    { "pieza": "carrusel_foto_con_bloque | carrusel_solida | reel_gancho | reel_reflexion", "voto": "si | no", "motivos": ["colores | letra | foto | texto | acomodo | elementos"], "nota": "string | null" }
  ],
  "refresh": {
    "numero": 0,
    "nota": "string | null (lo que no le gustó, escrito o transcrito)",
    "opciones_rechazadas": [{}]
  }
}
```

## 4. Salida

### Modo ronda (rondas 1 y 2: paletas)
```json
{
  "skill_version": "kit-visual-v1",
  "ronda": 1,
  "opciones": [
    {
      "id": "A",
      "nombre": "string (2 o 3 palabras)",
      "porque": "string (máx. 12 palabras)",
      "colores": { "principal": "#RRGGBB", "acento": "#RRGGBB", "fondo": "#RRGGBB", "texto": "#RRGGBB" }
    },
    { "id": "B", "nombre": "...", "porque": "...", "colores": {} }
  ]
}
```

### Modo ronda (ronda 3: tipografías)
```json
{
  "skill_version": "kit-visual-v1",
  "ronda": 3,
  "opciones": [
    { "id": "A", "nombre": "string", "titulos": "Google Font", "texto": "Google Font", "porque": "string" }
  ]
}
```
Cuatro opciones (A a D).

### Modo ronda (ronda 4: estilo de títulos)
```json
{
  "skill_version": "kit-visual-v1",
  "ronda": 4,
  "opciones": [
    { "id": "A", "mayusculas": false, "caja": "ninguna | solida | translucida" }
  ]
}
```
Cuatro opciones (A a D).

### Modo final (el kit)
```json
{
  "skill_version": "kit-visual-v1",
  "colores": { "principal": "#RRGGBB", "acento": "#RRGGBB", "fondo": "#RRGGBB", "texto": "#RRGGBB" },
  "tipografias": {
    "titulos": { "familia": "string", "peso": 400 },
    "texto": { "familia": "string", "peso": 400 }
  },
  "titulos_video": [
    {
      "estilo": "string (nombre del estilo elegido)",
      "uso": "ganchos | reflexiones | valor | portada_carrusel | todos",
      "mayusculas": false,
      "alineacion": "centro | izquierda",
      "caja": "ninguna | solida | translucida | banda",
      "resaltado": "ninguno | marcador | palabra_grande | linea",
      "color_texto": "#RRGGBB",
      "color_detalle": "#RRGGBB | null"
    }
  ],
  "subtitulos": { "color_texto": "#RRGGBB", "color_resaltado": "#RRGGBB", "posicion": "centro | inferior", "palabras_por_linea": 3 },
  "elementos": [
    { "id": "onda | destello | linea | circulo | etiqueta_serie | flecha | subrayado | estrella", "color": "#RRGGBB" }
  ],
  "carrusel": {
    "estilos_portada": ["solida | foto_con_bloque | foto_completa"],
    "fondo_portada": "#RRGGBB",
    "color_titulo_portada": "#RRGGBB",
    "color_bloque_foto": "#RRGGBB",
    "fondo_interiores": "#RRGGBB"
  },
  "preferencias_visuales": [
    { "sobre": "string (tipo de pieza o elemento)", "le_gusta": true, "detalle": "string" }
  ],
  "mensaje_al_creador": "string (1 o 2 frases)"
}
```

## 5. Reglas

1. **Ronda 1:** la opción A parte de los colores que la auditoría detectó; la B es una alternativa con el mismo carácter pero otra temperatura o contraste. Si no hay auditoría, ambas salen del tono elegido.
2. **Ronda 2:** cuatro variantes de la ganadora (A a D); cada una cambia solo acento o fondo, nunca todo. Al menos una conserva el acento y cambia el fondo, y al menos una conserva el fondo y cambia el acento.
3. **Respeta las notas de las tarjetas.** Si el creador pidió algo ("quiero algo estable", "más creativo"), tiene prioridad sobre lo detectado.
4. **El acento es escaso:** solo para resaltar (palabra clave de subtítulo, detalle). Nunca de fondo.
5. **Contraste:** texto sobre fondo y título sobre caja deben poder leerse en un celular. Moy lo valida con código (mínimo 4.5:1); si no pasa, la opción se descarta.
6. **Tipografías:** solo Google Fonts con acentos y ñ. Un par = una para títulos con carácter + una para texto muy legible. Nunca dos decorativas.
7. **Subtítulos** siempre en la tipografía de texto, peso alto, máximo 3 o 4 palabras por línea.
8. Nombres de opciones cálidos y cortos ("Bugambilia de día"), no técnicos.
9. El kit es **estable**: no se vuelve a proponer cambiarlo salvo que el creador lo pida.
10. **Refresh:** las opciones nuevas no repiten ninguna rechazada y siguen la nota. Si la nota es vaga ("no sé, no me gusta"), cambia la dirección completa (otra temperatura, otro contraste o un estilo tipográfico distinto). Nunca regreses `refresh` con más de 2; eso lo controla la app. El refresh **no borra** las opciones anteriores: la app muestra "Ver opciones anteriores" y el creador puede elegir de cualquier tanda.
11. **Elección doble:** solo en la ronda 4 el creador puede elegir hasta 2 estilos de título. Si elige 2, asigna a cada uno un `uso` distinto según sus voces o categorías (por ejemplo, uno para ganchos y valor, otro para reflexiones y portadas). Paletas y tipografías siempre son de una sola elección.
12. **Elementos:** máximo 2 de la biblioteca, siempre en el color de acento (o principal si el acento no contrasta). `etiqueta_serie` no cuenta en el límite; se usa sola cuando la pieza es parte de una serie.
13. **Carrusel con foto:** la portada `foto_con_bloque` pone el título sobre un bloque sólido de color, nunca directo sobre la foto, para que siempre se lea. En la revelación final se usan fotos reales del creador tomadas de la auditoría.
14. **Fotos para la revelación:** siempre las sube el creador, tenga o no contenido, con esta instrucción: "Sube 3 o 4 fotos que subirías normalmente a tu Instagram, salgas o no en ellas". Así elige con qué se identifica.
15. **Calificación de la revelación:** cada pieza se califica con 👍 o 👎. Con 👎 la app muestra chips (colores, letra, foto, texto, acomodo, elementos) y nota opcional. La skill ajusta **solo ese tipo de pieza**, nunca rehace el kit completo, y registra la preferencia en `preferencias_visuales` para que la usen carruseles (8), edición (13) y textos (6).
16. **Hasta 4 aciertos:** la revelación se repite, ajustando solo las piezas con 👎, hasta que las 4 tengan 👍. Máximo 3 ajustes por pieza; si una sigue sin gustar, ese tipo de pieza se marca como "no usar" en `preferencias_visuales` y se reemplaza por otro estilo de portada o de título.

## 6. Notas técnicas para Moy

- Cada ronda se muestra **aplicada** (portada de reel con `gancho_muestra`), no como muestras sueltas de color.
- Las fuentes se cargan de Google Fonts tanto en la app como en Remotion.
- Si el creador abandona a medias, se usa la opción A de cada ronda faltante.

---

## 7. Ejemplos

### Ejemplo 1 — @blombito (juego completo)

**Cómo jugó:** ronda 1 eligió A (Bugambilia de día); ronda 2, B (Blanco y sol); ronda 3, A (Editorial); ronda 4 usó un refresh y eligió dos estilos (Resaltador y Firma); ronda 5 usó un refresh y regresó a las opciones anteriores para elegir Destello y Onda. Notas de sus tarjetas: "quiero enfocarme en ser creativa" y "quiero un estilo estable".

**Salida (modo final)**
```json
{
  "skill_version": "kit-visual-v1",
  "colores": { "principal": "#AE0091", "acento": "#F4C542", "fondo": "#FFFFFF", "texto": "#2B1E2A" },
  "tipografias": {
    "titulos": { "familia": "DM Serif Display", "peso": 400 },
    "texto": { "familia": "Bricolage Grotesque", "peso": 700 }
  },
  "titulos_video": [
    { "estilo": "Resaltador", "uso": "ganchos", "mayusculas": false, "alineacion": "centro", "caja": "ninguna", "resaltado": "marcador", "color_texto": "#FFFFFF", "color_detalle": "#F4C542" },
    { "estilo": "Firma", "uso": "reflexiones", "mayusculas": false, "alineacion": "izquierda", "caja": "ninguna", "resaltado": "linea", "color_texto": "#FFFFFF", "color_detalle": "#AE0091" }
  ],
  "subtitulos": { "color_texto": "#FFFFFF", "color_resaltado": "#F4C542", "posicion": "inferior", "palabras_por_linea": 4 },
  "elementos": [
    { "id": "destello", "color": "#F4C542" },
    { "id": "onda", "color": "#F4C542" }
  ],
  "carrusel": {
    "estilos_portada": ["foto_con_bloque", "solida"],
    "fondo_portada": "#FFFFFF",
    "color_titulo_portada": "#2B1E2A",
    "color_bloque_foto": "#FFFFFF",
    "fondo_interiores": "#FFFFFF"
  },
  "preferencias_visuales": [
    { "sobre": "carrusel_foto_con_bloque", "le_gusta": false, "detalle": "El bloque magenta se siente invasivo; prefiere bloque blanco con magenta solo en la palabra clave" },
    { "sobre": "color_principal", "le_gusta": true, "detalle": "El magenta como detalle, nunca como fondo grande" }
  ],
  "mensaje_al_creador": "Tu kit ya se parece a ti: luminoso, con tu magenta de siempre y una letra que se siente creativa. A partir de hoy todo lo que hagas en la app va a verse así de consistente."
}
```

**Calificación de la revelación:** ronda 1 con 3 de 4 (👎 en el carrusel de bugambilias: elementos, "lo rosa es muy invasivo"); se ajustó solo esa pieza a bloque blanco con magenta en la palabra clave y llegó a 4 de 4.

**Aprendizajes de la prueba (ya aplicados a esta versión):** ronda 2 con 4 opciones; botón "Ninguna me convence" con nota y refresh; regresar a opciones anteriores; elección doble de estilos de título; ronda 5 de elementos; el creador siempre sube sus fotos; calificación por pieza hasta 4 aciertos.

---

## 8. Historial de versiones
- **v1** (13 oct 2026): primera versión, probada con @blombito.
