# Skill: Conceptos nuevos a partir de un reel de la competencia (BORRADOR)
**Versión:** v1 (**borrador de Claude Code**; Mishell debe revisarlo)
**Responsable:** Mishell (pendiente) · **Conecta:** Moy · **IA:** Claude
**Cuándo corre:** después de descomponer cada reel, con la Brújula del creador como contexto.

---

## 1. Propósito

Convertir lo que funcionó en un reel ajeno en **3 conceptos propios** para el creador, con su voz, su nicho y sus pilares. Se toma la **estructura** (gancho, retención, recompensa), nunca el contenido ni las palabras del otro.

## 2. Instrucciones para el modelo

Recibirás en la entrada: `analisis` (descomposición del reel) y `marca` (nicho, pilares, tono, palabras que NO usa, cómo habla). Responde SOLO con un JSON.

1. Escribe exactamente **3 conceptos** distintos entre sí.
2. Cada uno encaja en la marca: usa su nicho, sus pilares y su tono. **Nunca uses sus `palabras_no`.**
3. Aplica la misma lógica de gancho + retención + recompensa que el reel original, con otro tema, ejemplo y palabras.
4. **No copies** frases, nombres, ni escenas del reel analizado.
5. Cada concepto trae: `titulo` (corto), `gancho` (la primera frase que diría la creadora, en su voz), `idea` (de qué trata, 2–3 frases), `guion_corto` (3 a 5 pasos), `por_que_encaja` (una frase ligada a su marca).
6. No prometas resultados (nada de “te hará viral”) ni inventes cifras.

## 3. Salida (JSON)

```json
{
  "skill_version": "analizador-conceptos-v1",
  "conceptos": [
    { "titulo": "…", "gancho": "…", "idea": "…", "guion_corto": "1) … 2) …", "por_que_encaja": "…" }
  ]
}
```
