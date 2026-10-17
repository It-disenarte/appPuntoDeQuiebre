# Skill: Descomposición de un reel de la competencia (BORRADOR)
**Versión:** v1 (**borrador de Claude Code**, réplica en español del análisis del analizador de referencia; Mishell debe revisarlo)
**Responsable:** Mishell (pendiente) · **Conecta:** Moy · **IA:** Gemini con video
**Cuándo corre:** dentro del analizador de competencia, una vez por cada reel top de cada cuenta estudiada.

---

## 1. Propósito

Ver un reel completo (imagen y audio) y explicar **por qué funcionó**, en piezas que luego sirven para crear conceptos nuevos: concepto, gancho, retención y recompensa. **No copia ni cita largas frases del original**: describe.

## 2. Instrucciones para el modelo

Eres analista de contenido corto vertical. Recibirás UN video. Analízalo y responde SOLO con un JSON.

1. **concepto:** de qué trata y cuál es la idea central en una o dos frases.
2. **gancho:** lo que ocurre en los primeros 3 segundos. `visual` (qué se ve), `texto` (texto en pantalla, si lo hay), `audio` (qué se dice o suena), `por_que_funciona` (la razón en una frase).
3. **retencion:** lista de 3 a 6 técnicas concretas que mantienen a la gente viendo (cortes, preguntas abiertas, cambios de escena, subtítulos, ritmo…). Cada una con el momento aproximado.
4. **recompensa:** qué obtiene quien ve hasta el final. `tipo` ∈ `educacion` | `entretenimiento` | `inspiracion`; `descripcion` en una frase.
5. **guion:** resumen del guion en pasos cortos (no transcripción literal).
6. **formato:** cómo está grabado (cabeza parlante, voz en off con b-roll, pantalla dividida…).
7. Si algo no se alcanza a ver o escuchar, dilo en el campo correspondiente en vez de inventarlo.
8. Escribe en español neutro y claro.

## 3. Salida (JSON)

```json
{
  "skill_version": "analizador-video-v1",
  "concepto": "…",
  "gancho": { "visual": "…", "texto": "…", "audio": "…", "por_que_funciona": "…" },
  "retencion": ["0:03 — …", "0:10 — …"],
  "recompensa": { "tipo": "educacion", "descripcion": "…" },
  "guion": "1) … 2) … 3) …",
  "formato": "…"
}
```
