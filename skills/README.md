# Skills de IA

Las skills las escribe **Mishell** y las conecta **Moy**. Cada una es un prompt estructurado con entrada y salida JSON;
vive en su carpeta con versión (`skills/<nombre>/v<N>/skill.md`), **fuera del código de la app**. El archivo completo se
manda como *system prompt* y la entrada JSON como mensaje del usuario.

**Regla de oro (de Mishell):** los nombres de los campos JSON no se renombran entre versiones, solo se agregan.
Los esquemas de salida se validan con zod antes de guardar (`src/lib/skills/schemas.ts`).

| Skill | Versión | Estado en la app |
| --- | --- | --- |
| `brujula` | v2 | Conectada (Fase 2). Respuesta de **prueba** hasta que haya `ANTHROPIC_API_KEY`. |
| `perfil-voz` | v1 | Conectada (Fase 2). Respuesta de **prueba** hasta que haya `ANTHROPIC_API_KEY`. |
| `horario` | v1 | Conectada (Fase 2). **Reglas fijas en código**, sin IA, como indica la skill. |
| `kit-visual` | v1 | Conectada (Fase 2B). Respuesta de **prueba** hasta que haya `ANTHROPIC_API_KEY`. |
| `auditoria` | v1 | Guardada, se conecta en la Fase 3 (requiere Instagram). |
| `6-textos-publicacion`, `7-ideas-historias`, `8-carruseles`, `calificador-foto`, `optimizacion-perfil`, `guia-lives` | — | Se agregan en las fases que las usan. |

Cada llamada (real o de prueba) se registra en la tabla `ai_calls` con skill, versión, tokens y costo.

**Activar la IA real:** define `ANTHROPIC_API_KEY` (y opcionalmente `SKILLS_MODEL`) en Easypanel. Sin llave, todo sigue con
respuestas de prueba, marcadas como tales en pantalla.

## Skills escritas por Claude Code (26 oct 2026)
Por decisión del equipo, estas las escribió Claude Code (antes eran borradores pendientes de Mishell). Los campos de salida no cambiaron respecto a sus borradores v1.

| Skill | Versión | Estado |
| --- | --- | --- |
| `parrilla-guiones` (14) | v2 | Conectada. |
| `metricas-capturas` | v2 | Conectada (Gemini con visión). |
| `metricas-explicacion` (9) | v2 | Conectada (Claude; la app solo toma el texto de cada indicador). |
| `analizador-video` | v2 | Conectada (Gemini con video). |
| `analizador-conceptos` | v2 | Conectada (Claude, con respaldo de Gemini). |
| `reglas-aprendizaje` (10) | v1 | **Escrita pero sin conectar**: ver su apartado 8. |
| Frases motivacionales | — | Banco fijo en `src/lib/motivation.ts`; no usa IA. |
