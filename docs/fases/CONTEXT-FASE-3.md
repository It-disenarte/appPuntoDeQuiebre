# Contexto Fase 3 — Conexión con Instagram (infraestructura)

Migración 0015 aditiva: `ig_connections` (una por creador, token cifrado AES-256-GCM con `TOKEN_ENC_KEY`) e `ig_media` (publicaciones recientes y métricas).

- Flujo OAuth oficial (Instagram API con inicio de sesión de Instagram), solo lectura (`instagram_business_basic`, `instagram_business_manage_insights`). `GET /api/instagram/connect` (rate limit, cookie `state` HttpOnly SameSite=Lax) → página de Instagram → `GET /api/instagram/callback` (valida `state`, canjea código, token largo de 60 días, perfil; rechaza cuentas personales y cuentas ya ligadas a otro usuario).
- Devoluciones de Meta: `POST /api/instagram/deauthorize` y `POST /api/instagram/delete` verifican `signed_request` con HMAC-SHA256 (comparación de tiempo constante) y borran la conexión y los datos; son públicas en el proxy porque Meta las llama sin sesión.
- Worker diario 5:30 (México): renueva permisos que vencen en menos de 20 días y sincroniza perfil, 30 publicaciones y sus insights (un insight que falla no detiene el resto; código 190 = permiso caducado → se pide reconectar).
- Pantalla `/mi-marca/instagram`: conectar, estado, publicaciones con métricas, actualizar, desconectar y borrar datos. Los seguidores conectados alimentan la etapa de la parrilla.
- Pasos de configuración en Meta: `docs/instagram-setup.md`.

NO verificado contra la API real (faltan las credenciales de Meta): los nombres de campos y métricas se tomaron de la documentación y las pruebas usan respuestas simuladas. Pendiente: auditoría de la cuenta (skill 0) y tarjetas "Así te vemos", insights de cuenta (alcance, % de no seguidores), historias (hay que guardarlas diario), publicación (Fase 9, requiere `instagram_business_content_publish`), reemplazar las capturas de métricas por la API y la racha verificada por API.
