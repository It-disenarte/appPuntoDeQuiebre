# Contexto Fase 4 — Optimización de perfil y calificador de foto (skills 4 y 5)

Tabla `profile_opt` (migración 0010, aditiva), una fila por creador. Pantalla `/mi-marca/perfil`.

- Mientras no esté la API de Instagram (bloqueo B1), el creador escribe su perfil actual (usuario, nombre, bio, enlace, categoría, destacadas). La app NO cambia el perfil: da propuestas para copiar y pegar y un check "ya lo apliqué" manual (la detección por API de la regla 9 queda pendiente).
- Skill 4: diagnóstico, 5 nombres con palabra clave, 5 biografías (el código cuenta caracteres reales y descarta las de más de 150), enlace, categoría, destacadas (≤15 caracteres) y orden de cambios. "Ninguna me convence" + nota → 5 nuevas, máx. 2 veces por parte sin borrar las anteriores. El creador puede escribir la suya (se acepta; avisa si el nombre no lleva la palabra clave). 👍/👎 en enlace, categoría y destacadas.
- Portadas de destacadas: PNG 1080×1920 con círculo central de 740 px y aro, solo estilo SÓLIDO con colores del kit, generados en el navegador (ZIP o una por una). Íconos: se resuelven a un conjunto de lucide (la skill pide Tabler).
- Skill 5 (Gemini visión): calificación 1–10 por rúbrica, "lo que funciona" primero, 2–3 consejos, tamaños reales (perfil/feed/comentarios) con el recorte sugerido, historial con "antes X → ahora Y" y mejor foto entre las últimas 3. Las fotos se re-codifican sin metadatos y viven en MinIO `perfil/<usuario>/`. Sin Gemini: calificación de ejemplo marcada.
- Pendiente: juego de destacadas (8 patrones de nombres, estilo "con foto" y detección de rostro), lectura del perfil por captura o API, recalificar sola al detectar foto nueva por API, y que "otras redes" alimente la skill.
