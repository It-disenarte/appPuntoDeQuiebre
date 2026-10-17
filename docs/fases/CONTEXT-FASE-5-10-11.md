# Contexto Fases 5 (analizador), 10 parcial (avisos) y 11 (métricas por capturas)

Para la IA auditora. Todo es aditivo (migración 0007, sin DROP).

## Infraestructura común
- `jobs` (src/lib/jobs.ts): cola en BD, `FOR UPDATE SKIP LOCKED`, reintentos con espera de 60 s, recuperación de trabajos perdidos a los 15 min. El worker tiene un ciclo por tipo (`metricas.leer`, `analizador.correr`).
- Web Push propio (src/lib/push.ts): endpoints solo de servicios push permitidos (anti-SSRF). Sin VAPID no envía nada.
- Avisos (src/lib/notify): reglas puras `dueNotifications`, deduplicados por (usuario, tipo, clave), modo pausa máx. 7 días.

## Fase 11 — métricas por capturas
Capturas → Gemini visión → el creador confirma/corrige cifras → comparación contra el mes anterior en código → explicación con Claude (solo el texto; los números son de código) → gráficas SVG. Las imágenes se borran al leerse. Skills borrador: `metricas-capturas`, `metricas-explicacion`.

## Fase 5 — analizador de competencia (réplica del analizador de referencia)
Apify (`apify~instagram-scraper`) → top-K por vistas → descarga del video con allowlist de hosts (cdninstagram/fbcdn/instagram), https, sin redirecciones, tope 80 MB → Gemini Files API → skill `analizador-video` → Claude `analizador-conceptos` (3 ideas con la Brújula). El video no se guarda; la miniatura sí, en MinIO. Límite: 1 corrida cada 7 días (las fallidas no cuentan), máx. 8 cuentas, `topK` ≤ 3. Sin llaves corre con ejemplos marcados.
Pendiente: alimentar "lo probado" de la parrilla con las estrellas; actualizar estadísticas de seguidores por cuenta.

## Puntos a auditar
Allowlist de descarga, límite semanal (carrera entre dos clics: hay chequeo de corrida activa, no candado), reintento idempotente de `runAnalyzer`, privacidad de capturas, costo por corrida.
