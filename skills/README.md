# Skills de IA

Cada skill vive en su carpeta con versión (`skills/<nombre>/v<N>/`), **fuera del código de la app**.
Mishell escribe el prompt y acuerda con Luis el esquema JSON de salida antes de construir la pantalla.
Hasta que la skill real esté conectada, la app corre una versión de **prueba** con reglas que respeta el mismo esquema
(`src/lib/brujula/manual.ts`, `src/lib/brujula/voice.ts`) y marca esa salida como "de prueba".

Cada llamada (real o de prueba) se registra en la tabla `ai_calls` con skill, versión, costo y tokens.

| Skill | Versión | Estado | Esquema de salida |
| --- | --- | --- | --- |
| `brujula` | v1 | respuesta de prueba | `brujulaSkillOutput` en `src/lib/brujula/manual.ts` |
| `voz` | v1 | respuesta de prueba (transcripción y perfil) | `voiceProfileSchema` en `src/lib/brujula/voice.ts` |
