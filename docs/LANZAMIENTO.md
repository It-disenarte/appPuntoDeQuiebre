# Lista de verificación de lanzamiento

Qué revisar antes de abrir la app a clientes reales y qué vigilar las primeras semanas. Marca cada casilla cuando esté hecha. Última revisión del documento: 26 oct 2026.

> **Regla de oro:** las llaves y contraseñas viven **solo en Easypanel**. Nunca en el chat, en el repositorio ni en capturas.

## 1. Servidor y base de datos
- [ ] **pdq-app y pdq-worker** desplegados con el mismo commit (siempre se despliegan los dos).
- [ ] Los cuatro servicios en verde: `pdq-app`, `pdq-worker`, `pdq-db`, `pdq-minio`.
- [ ] **Respaldo diario** de `pdq-db` activo (Backups) y **una prueba de restauración** hecha al menos una vez.
- [ ] **Copia fuera del servidor** (Cloudflare R2 o Backblaze B2). Hoy el respaldo vive en el mismo VPS. *Pendiente.*
- [ ] Snapshot o backup automático del VPS en el panel del proveedor.
- [ ] Espacio en disco del VPS revisado (videos temporales, respaldos). Los videos se borran a los 30 días.
- [ ] Dominio propio y HTTPS funcionando (hoy se usa el de Easypanel). `APP_URL` coincide con la dirección final, sin diagonal al final.
- [ ] `TRUSTED_PROXY_HOPS` correcto: 1 con Traefik de Easypanel; 2 si hay Cloudflare delante.

## 2. Variables de entorno (Easypanel → Environment, en **pdq-app y pdq-worker**)
| Variable | Qué es | Estado |
| --- | --- | --- |
| `DATABASE_URL`, `APP_URL` | Base de datos y dirección pública | [ ] |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | MinIO (endpoint interno) | [ ] |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | IA (las dos: una respalda a la otra) | [ ] |
| `APIFY_TOKEN`, `APIFY_TRENDS_ACTOR`, `APIFY_TRENDS_INPUT` | Tendencias reales | [ ] |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Avisos al celular. `VAPID_SUBJECT` con un correo real | [ ] |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BASICO`, `STRIPE_PRICE_PRO` | Cobros. **En modo real: llaves `sk_live_`, webhook y precios nuevos** | [ ] |
| `HEALTH_TOKEN` | Para vigilar la app (mínimo 24 caracteres) | [ ] |
| `TOKEN_ENC_KEY`, `META_APP_ID`, `META_APP_SECRET` | Solo cuando se conecte Instagram (pausado) | n/a |

- [ ] **La llave de Apify** es la regenerada (la anterior se filtró). La de Stripe y las demás nunca se han compartido por chat.
- [ ] `DATABASE_POOL_MAX` **no** está definida en Easypanel (solo se usa en local).

## 3. Gasto controlado
- [ ] **Anthropic:** límite mensual bajo (hoy $30) con avisos por correo; recarga automática apagada o en un monto que aceptes.
- [ ] **Google (Gemini):** prepago con recarga automática apagada. Antes de abrir, **recargar un saldo suficiente** para los primeros clientes y poner un aviso de saldo bajo.
- [ ] **Apify:** hoy plan gratuito de $5 al mes; si hay muchos clientes, subir de plan **y fijar un límite mensual**.
- [ ] **Admin → Límites y costos:** cupos por plan revisados (imágenes con IA, ediciones, voz en off) y precios estimados al día.
- [ ] **Admin → Modelos de IA:** los modelos aparecen en verde con "Probar" (Claude, Gemini texto, Gemini audio/capturas/video, imágenes). Revisar este panel **cada mes**: Google retira modelos viejos.
- [ ] Fecha en el calendario para revisar saldos a la semana de abrir.

## 4. Cobros
- [ ] Empresa constituida y cuenta de Stripe **activada** para cobros reales (pendiente de Erick).
- [ ] Productos y precios reales creados; `STRIPE_PRICE_*` actualizados.
- [ ] Webhook de Stripe apuntando a la dirección final, con su `STRIPE_WEBHOOK_SECRET` nuevo.
- [ ] Prueba con **un cobro real pequeño** de una tarjeta propia, y su reembolso.
- [ ] Datos fiscales y facturas: probar que **Admin → Facturas** recibe una solicitud.
- [ ] Códigos de acceso y de cortesía revisados en **Admin → Códigos**.

## 5. Contenido y textos
- [ ] **Términos y aviso de privacidad definitivos** (hoy son un borrador). Al cambiarlos, subir `TERMS_VERSION` en `src/lib/legal.ts`.
- [ ] **Video de bienvenida** de Erick subido (Admin → Ajustes).
- [ ] **Enlaces de la comunidad** (sesión en vivo, Discord, WhatsApp) en Admin → Ajustes.
- [ ] Plantillas de carruseles definitivas del equipo de MKT.
- [ ] Revisar a mano los textos de la bienvenida, los avisos y las frases de **Hoy**.

## 6. Seguridad y cuentas
- [ ] Al menos **dos administradores** (por si se pierde una contraseña; la app no tiene recuperación automática).
- [ ] Contraseñas de administrador largas y únicas.
- [ ] **Borrar las cuentas de prueba** que ya no sirvan (y sus datos) o dejarlas identificadas.
- [ ] Revisar **Admin → Errores**: sin errores nuevos sin explicar durante las pruebas finales.
- [ ] Revisar **Admin → Clientes**: que se pueda ver, suspender y dar Pro de cortesía a una cuenta.
- [ ] Ninguna llave en el repositorio (`git log -p` sin secretos) y `.env.local` fuera de git.

## 7. Prueba final de punta a punta (una cuenta **nueva**, en el celular real)
Hazla con el correo de alguien que no conozca la app, si es posible.
- [ ] Registro → plan → pago → bienvenida → brújula, voz, kit visual y horario → primera semana.
- [ ] **Grabar un video** con teleprompter flotante y cámara nativa → subir → **edición automática** → descargar.
- [ ] **Voz en off** con una grabadora externa → subir → edición.
- [ ] **Carrusel** con imágenes creadas por IA → exportar PNG.
- [ ] Textos de publicación, Directos, Optimiza tu perfil, Tendencias.
- [ ] **Métricas** por capturas → informe → Progreso → «Lo que he aprendido de ti».
- [ ] **Avisos** de grabar y publicar llegan al celular (con la app cerrada).
- [ ] Cambio de plan, cancelación y un cobro fallido.
- [ ] Probar también en **iPhone** (exportar el carrusel en PNG, avisos y la instalación de la app).

## 8. Día de lanzamiento
- [ ] Hacer un respaldo manual de la base de datos justo antes de abrir.
- [ ] Abrir primero a un **grupo pequeño** (5 a 10 personas) antes del lanzamiento general.
- [ ] Tener a la mano: Admin → Errores, logs de `pdq-app` y `pdq-worker`, saldos de Claude y Gemini.
- [ ] Un canal claro para que los clientes reporten problemas (WhatsApp o Discord).

## 9. Primeras semanas (vigilar)
- **A diario:** Admin → Errores; saldo de Gemini y gasto de Claude.
- **A la semana:** que los respaldos se hayan hecho todos los días; espacio en disco; que los avisos lleguen.
- **Al mes:** Admin → Modelos de IA (modelos retirados), cupos y costos reales contra lo estimado, informe mensual de métricas de los clientes.

## 10. No es necesario para abrir (se puede después)
- Conexión con Instagram (Meta, verificación del negocio) y la auditoría «Así te vemos».
- Carrusel animado en video (Pro), TikTok y Facebook como redes completas, Nano Banana Pro.
- App nativa de Android para micrófonos USB.
