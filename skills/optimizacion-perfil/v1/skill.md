# Skill 4: Optimización de perfil
**Versión:** v1 (borrador — esquema JSON pendiente de acordar con Moy)
**Responsable:** Mishell · **Conecta:** Moy · **IA:** Claude
**Cuándo corre:** después del alta (cuando ya existen manual, kit y voz), antes de la primera parrilla. Se puede repetir cada 3 meses o cuando cambie la brújula.

---

## 1. Propósito

Que el perfil explique en 3 segundos **quién es, a quién ayuda y por qué seguirlo**, con la marca del manual. Entrega propuestas de nombre con palabra clave, biografía, enlace, categoría y destacadas, listas para copiar y pegar. La app **no cambia el perfil**: el creador copia y lo hace él (no pedimos permisos de edición).

## 2. Rol

Eres una estratega de perfiles de Instagram. Escribes corto, claro y con la voz del creador; piensas en alguien que llega por primera vez desde un reel y decide en segundos si sigue o no.

## 3. Entrada

```json
{
  "creador_id": "string",
  "perfil_actual": { "usuario": "string", "nombre": "string", "biografia": "string", "enlace": "string | null", "categoria": "string | null", "destacadas": ["string (nombres; la API no las da, se leen de una captura)"] },
  "brujula": { "nicho": {}, "propuesta_valor": "string", "frase_de_marca": "string", "pilares": [], "vision": {}, "lives": {} },
  "perfil_voz": { "palabras_frecuentes": [], "frases_firma": [] },
  "kit_visual": { "colores": {}, "elementos": [] },
  "otras_redes": [{ "red": "tiktok | facebook | youtube", "usuario": "string" }]
}
```

## 4. Salida

```json
{
  "skill_version": "optimizacion-perfil-v1",
  "diagnostico": [{ "parte": "nombre | biografia | enlace | categoria | destacadas", "estado": "bien | mejorar | falta", "por_que": "string" }],
  "nombre": { "opciones": ["string (5)"], "palabra_clave": "string" },
  "biografia": { "opciones": [{ "texto": "string (máx. 150 caracteres)", "caracteres": 0 }], "nota": "5 opciones" },
  "enlace": { "recomendacion": "string", "por_que": "string" },
  "categoria": "string",
  "destacadas": [{
    "nombre": "string (máx. 15 caracteres)",
    "accion": "mantener | renombrar | agregar",
    "que_lleva": "string (qué historias guardar ahí)",
    "portada": { "estilo": "solida | foto", "fondo": "#RRGGBB", "icono": "string (id de la biblioteca de íconos)", "color_icono": "#RRGGBB", "elemento": "string | null" }
  }],
  "orden_de_cambios": ["string"]
}
```

## 5. Reglas

1. **Primero diagnóstico:** se dice qué ya está bien antes de proponer cambios. Si algo funciona, se mantiene.
2. **Nombre:** **5 opciones**, cada una con la palabra clave del nicho o una variante (el campo nombre sí se busca en Instagram). Mezclar estilos: corta, con su frase de marca, con un pilar, con su voz.
3. **Biografía:** máximo 150 caracteres, contados por código. Estructura: qué haces / para quién o cómo / invitación o dato (ciudad, lives). Usa la frase de marca o palabras de su voz; nada de "experta" ni promesas.
4. **5 opciones de biografía:** al menos una que respeta lo que ya tiene; las demás varían el orden (qué hace / para quién / invitación) y el tono.
5. **Enlace:** si no tiene, recomendar el destino más útil hoy (otra red donde está activo, un formulario, una página de enlaces). Nunca inventar una URL.
6. **Destacadas:** respetar los nombres que ya tiene si son consistentes; proponer solo lo que falte (por ejemplo, "Conóceme" o una de lives). Máximo 7.
6B. **Si no tiene destacadas (o no tienen portada):** proponer de 4 a 6 según su nicho y pilares, siempre con una de "quién soy" primero. Nombres cortos (máx. 15 caracteres) y con un mismo patrón. Primero el creador elige el **estilo de nombres** entre 8 patrones, cada uno con sus nombres ya adaptados a su nicho:
   1. Verbos en "-ando" (Creando, Viviendo)
   2. Una sola palabra (Ideas, Vida)
   3. Por tema (Sobre mí, Reflexiones)
   4. Invitación (Conóceme, Inspírate, Únete)
   5. Con "Mi / Mis" (Mi historia, Mis ideas)
   6. En inglés corto (About me, Inspo, Daily)
   7. Sensaciones (Esencia, Chispa, Calma)
   8. Juego con su marca (prefijo o sufijo de su nombre: Blombideas, Blombivida)
   El patrón 8 hace que la marca hable en cada destacada; se ofrece cuando el nombre se presta.
6C. **Portadas de destacadas:** el creador elige el estilo para todas (no se mezclan):
   - **Sólida:** fondo con los colores del kit (alternando principal y fondo claro) + ícono de una biblioteca fija + opcional un elemento del kit (por ejemplo, destello).
   - **Foto:** una foto suya por destacada con aro del color principal. La app centra la cara con detección de rostro.
   La app genera PNG de 1080 × 1920 con el ícono o la cara dentro del círculo central (zona segura de 740 px), los deja descargar y muestra cómo subirlos ("Editar destacada → Editar portada").
7. **Emojis** solo como viñeta, uno por línea, en el estilo del creador.
8. **"Ninguna me convence" + nota** en nombre y biografía genera 5 nuevas (máx. 2 veces) sin borrar las anteriores.
9. **Cambio detectado:** la app revisa el perfil por API al día siguiente; si el creador ya aplicó un cambio, lo marca como hecho ("¡Ya actualizaste tu bio! ✅") y lo cuenta en su progreso.
10. **Nombre escrito por el creador:** se acepta tal cual; solo se avisa si no lleva ninguna palabra que la gente busque.
11. **Calificación:** la app muestra cada parte con 👍 / ✏️ editar / 👎, igual que el manual; lo editado se guarda.

---

## 5B. Notas técnicas para Moy

- **Juego de destacadas con vista previa en vivo:** estilo de nombres → cuáles (4 a 6, con "escribe una propia") → portada (sólida / con foto / foto con color encima + barra de opacidad) → colores del kit → centro (ícono / inicial con la letra del kit / nada) → elemento del kit → aro.
- **Íconos:** biblioteca Tabler Icons (licencia MIT); la skill solo elige el id del ícono.
- **Render:** PNG de 1080 × 1920; ícono o cara dentro del círculo central y el aro dibujado en la imagen (Instagram no pone aros).
- Con foto: detección de rostro para centrar.

## 6. Ejemplos

### Ejemplo 1 — @blombito

**Perfil antes:** nombre "Blombito | \"Lo que sea que hagas, hazlo bonito\"" · bio "La creatividad vive en cada uno de nosotros / Yo te enseño a verla y explotarla / México, Querétaro, SJR" · sin enlace · destacadas Blombitando, Creando, Jalando, Inspirando, Viviendo.

**Resultado de la prueba**
| Parte | Resultado |
|---|---|
| Nombre | Rechazó 2 tandas (7 opciones con palabra clave + 5 con otra dirección) y **escribió el suyo**: "Blombito \| Pensamiento creativo ✨" (lleva palabra clave) |
| Biografía | Eligió la opción que respetaba la suya y **ya la aplicó**: "✨ La creatividad vive en cada uno de nosotros / 💜 Yo te enseño a verla y explotarla / 🎥 Lives en TikTok · 📍 SJR, Qro." (113 caracteres) |
| Enlace | **Ya lo aplicó**: su perfil de TikTok, donde hace lives |
| Categoría | Blogger 👍 |
| Destacadas | Mantener sus 5 (Blombitando primero) y agregar "Transmitiendo" para lives. Propuso que la app **haga las portadas** (sólidas o con foto) y sugiera destacadas por nicho para quien no tenga; se le generaron 3 portadas de prueba para "Transmitiendo". Después repitió el paso como si no tuviera destacadas: pidió más estilos de nombres (quedaron 8) y armó las suyas en el juego con vista previa: **-ando** (Blombitando, Creando, Pensando, Inspirando, Transmitiendo, Jalando), sólidas magenta y blanco alternadas, ícono al centro, destello y aro amarillo |

**Aprendizajes:** pidió 5 opciones de nombre y de biografía (antes eran 2); el campo para escribir el propio en el último refresh fue el que resolvió el nombre; aplicó cambios antes de terminar la prueba, de ahí la regla de detectar cambios por API.

---

## 7. Historial de versiones
- **v1** (14 oct 2026): primera versión, probada con @blombito.
