# Skill `voz` · v1

**Entrada:** transcripción de la muestra de voz (2 a 3 minutos) y su duración en segundos.

**Salida** (JSON, esquema `voiceProfileSchema`):

```json
{
  "vocabulary": ["string"],                          // palabras que más usa
  "fillers": [{ "word": "string", "count": 0 }],     // muletillas
  "pace": { "wpm": 0, "label": "Pausado | Natural | Ágil" },
  "sentenceLength": 0,
  "traits": ["string"],
  "summary": "string"
}
```

Mientras no esté conectado el servicio de transcripción (Gemini), la grabación de audio usa una transcripción de PRUEBA
y el perfil queda marcado como "de prueba". Si el usuario escribe un texto en lugar de grabar, el perfil se calcula con reglas reales.
El audio nunca se conserva: se borra después de transcribirlo.
