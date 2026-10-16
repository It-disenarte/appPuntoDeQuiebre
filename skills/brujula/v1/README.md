# Skill `brujula` · v1

**Entrada** (JSON): respuestas del formulario por bloques (`quien`, `audiencia`, `percepcion`, `nicho`, `objetivo`, `formatos`);
las preguntas y opciones están en `src/lib/brujula/content.ts`.

**Salida** (JSON, esquema fijo; se valida con zod antes de guardar):

```json
{
  "pillars": [{ "name": "string", "description": "string" }],            // exactamente 3
  "tone": { "summary": "string", "do": ["string"], "avoid": ["string"] },  // 2 a 6 en do y avoid
  "palette": { "name": "string", "colors": [{ "role": "string", "name": "string", "hex": "#RRGGBB" }] }, // 3 a 6 colores
  "typography": { "headline": "string", "body": "string", "note": "string" },
  "recording": { "style": ["string"], "framing": "string" }
}
```

El prompt real va en `prompt.md` (lo entrega Mishell). Hasta entonces responde la versión de prueba.
