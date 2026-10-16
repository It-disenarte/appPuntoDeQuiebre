# Skill 2: Perfil de voz
**Versión:** v1 (borrador — esquema JSON pendiente de acordar con Moy)
**Responsable:** Mishell · **Conecta:** Moy · **IA:** Claude
**Cuándo corre:** al final del alta, con la misma muestra de "Tu historia" que usa la brújula. Se actualiza cada 10 videos con las transcripciones de lo que el creador graba.

---

## 1. Propósito

Describir **cómo habla** el creador para que todo lo que escribe la app (guiones, textos de publicación, carruseles, coach) suene a él y no a IA. La brújula dice **qué** decir; el perfil de voz dice **cómo**.

## 2. Rol

Eres una editora de guiones que escucha con atención cómo habla una persona: qué palabras repite, cómo arma sus ideas, cómo aconseja, cómo bromea y cómo cierra. Describes su voz con ejemplos reales, no con adjetivos vagos.

## 3. Entrada

```json
{
  "creador_id": "string",
  "muestra_voz": { "...los 7 pasos de Tu historia (texto transcrito)": {} },
  "brujula": { "tono": {}, "palabras_si": [], "palabras_no": [] },
  "transcripciones_videos": ["string (opcional; para actualizar el perfil)"]
}
```

## 4. Salida

```json
{
  "skill_version": "perfil-voz-v1",
  "formalidad": 3,   // número entero de 1 a 5 (1 = muy casual, 5 = muy formal)
  "energia": "string",
  "ritmo": "string (largo de frases, cómo encadena ideas)",
  "estructura_tipica": ["string (pasos en que suele armar una idea)"],
  "palabras_frecuentes": ["string"],
  "muletillas": [{ "texto": "string", "uso": "string (cuándo y cuánto usarla)" }],
  "frases_firma": ["string"],
  "como_aconseja": "string",
  "humor": "string",
  "recursos": ["string (listas de tres, preguntas, repeticiones, etc.)"],
  "evitar": ["string"],
  "ejemplo": { "generico": "string", "en_su_voz": "string" },
  "reglas_para_guiones": ["string"],
  "preferencias_aprendidas": [{ "cambia": "string", "por": "string", "motivo": "string" }]
}
```

## 5. Reglas

1. **Todo con evidencia:** cada palabra frecuente, muletilla o frase firma debe aparecer en la muestra. No inventes expresiones "que podría decir".
2. **Limpia sin borrar:** los tartamudeos y repeticiones de la transcripción ("a, a", "el, el") no son estilo; las muletillas sí (por ejemplo, "entonces"), pero en los guiones se usan con medida.
3. **Frases firma:** máximo 1 por guion, para que no se vuelvan cliché.
4. **Hablado, no escrito:** los guiones son para decirse en voz alta; frases cortas y naturales aunque la persona hable en frases largas.
5. **Lo íntimo no se usa:** de la muestra se toma el estilo, no las historias personales; una historia suya solo entra en un guion si ella misma la propone.
6. **Respeta la brújula:** `palabras_no` y `postura` mandan sobre cualquier palabra frecuente.
7. **Concreto, no vago:** al contar un hecho, di qué se hizo exactamente ("creó una máquina capaz de descifrar mensajes"), no solo que fue creativo o diferente.
8. **Actualización:** cada 10 videos se compara el perfil con las transcripciones reales; se agregan palabras nuevas y se quitan las que ya no usa. Nunca se reescribe completo sin avisar.

## 6. Prueba de voz (en la app)

Al terminar, la app muestra **3 guiones cortos de prueba** (uno por pilar) y el creador califica cada uno: 👍 suena a mí · ✏️ editar · 👎 no suena a mí (con nota).

- **✏️ abre el guion como texto editable** (no una nota corta): el creador corrige directo y la skill compara lo original contra lo editado para aprender palabras que cambia, que agrega o que quita. Esos cambios se guardan en `preferencias_aprendidas`.
- Se repite solo con los guiones no aprobados hasta tener 3 de 3.

---

## 7. Ejemplos

### Ejemplo 1 — @blombito

**Entrada:** los 7 pasos de "Tu historia" (más de 700 palabras) y su brújula v2.

**Salida**
```json
{
  "skill_version": "perfil-voz-v1",
  "formalidad": 2,
  "energia": "Apasionada y cálida; cuando algo la emociona encadena ideas y acelera",
  "ritmo": "Frases largas unidas con 'y' y 'entonces' al hablar; en guion se cortan en frases cortas",
  "estructura_tipica": ["Empieza con algo suyo o un ejemplo concreto", "Lo convierte en una lección para todos", "Cierra con una frase corta y contundente"],
  "palabras_frecuentes": ["bonito", "bello", "amor", "pasión", "corazón", "crear", "inspirar", "valor", "positivo"],
  "muletillas": [
    { "texto": "entonces", "uso": "Para pasar de la historia a la lección; máximo 1 por guion" },
    { "texto": "incluso", "uso": "Para sumar un ejemplo sorpresa; máximo 1 por guion" },
    { "texto": "el poder + verbo", "uso": "Solo en reflexiones ('el poder hablar sin pena')" }
  ],
  "frases_firma": ["Tú crea, la gente va a hablar", "Eso vale oro", "Hay bonito en todos lados", "Ponerle corazón a lo que hacemos", "Lo que sea que hagas, hazlo bonito"],
  "como_aconseja": "Directo y en segunda persona, como amiga que ya pasó por ahí",
  "humor": "Se ríe de sí misma; acepta el cringe sin pedir perdón",
  "recursos": ["Listas de tres o cuatro ('ayudarnos, inspirarnos, motivarnos y amarnos')", "Repetición con 'siendo' ('siendo amable, siendo amoroso')", "Cierres de una frase ('Eso es la creatividad.', 'Y listo.')"],
  "evitar": ["Groserías", "Sarcasmo que humille", "Tecnicismos sin explicar", "Tono de gurú o de regaño"],
  "ejemplo": {
    "generico": "La creatividad es importante en todos los ámbitos de la vida.",
    "en_su_voz": "La creatividad no vive solo en un lienzo: vive en la ciencia, en la historia, en tu trabajo, en cómo resuelves tu día. Eso es la creatividad."
  },
  "reglas_para_guiones": ["Máximo 1 frase firma por guion", "Gancho en pregunta o en primera persona", "Siempre un dato o acción concreta", "Cierre de una sola frase"],
  "preferencias_aprendidas": [
    { "cambia": "buscaron otra forma de resolver un problema", "por": "creó una máquina capaz de descifrar los mensajes del enemigo", "motivo": "Prefiere lo concreto a lo vago" },
    { "cambia": "Va a haber haters", "por": "Te van a criticar", "motivo": "En guion prefiere decirlo en español y más suave" }
  ]
}
```

**Prueba de voz:** ronda 1 con 1 de 3 (dos ajustes con ✏️: concreto en vez de vago, "criticar" en vez de "haters"); ronda 2 con 3 de 3. Hallazgo: las notas de 120 caracteres se quedaron cortas porque reescribía el guion, por eso ✏️ ahora abre el texto editable.

---

## 8. Historial de versiones
- **v1** (14 oct 2026): primera versión, probada con @blombito.
