# CONTEXT · Fase 0 — Cimientos

> Documento para la IA que audita vulnerabilidades y errores de esta fase.
> Fecha: 2026-10-14 · Versión de la app: 0.1.1 (incluye la remediación de la auditoría 1, ver §12) · Estado: pendiente de aprobación.

## 1. Qué es la app y qué cubre esta fase

PWA para creadores de contenido principiantes (marca personal). Un ciclo semanal: brújula de marca → analizar → guiones → grabar → publicar en Instagram → medir → aprender. Titular: Punto de Quiebre. Hay dos roles: `creator` y `admin`.

**Alcance de la Fase 0**
- Proyecto Next.js 16.4 (App Router, Turbopack, React 19.3) + TypeScript estricto.
- Postgres con Drizzle ORM y migraciones SQL versionadas.
- Autenticación con correo y contraseña: inicio y cierre de sesión, cambio de contraseña y contraseña temporal obligatoria.
- **No hay registro público ni recuperación de contraseña por correo** (es una decisión de producto: un admin la restablece).
- Límite de intentos de inicio de sesión y bitácora de auditoría.
- Sistema de diseño de marca, shell de 5 secciones (las pantallas usan **datos de ejemplo fijos**, no de la BD) y panel de admin mínimo (conteos + bitácora).
- PWA: manifiesto, íconos y service worker (pantalla sin conexión + receptor de push; todavía no hay suscripciones ni envíos).
- Worker pg-boss con un único trabajo de limpieza diaria.
- CLI de administración y Dockerfile para Easypanel.

**Fuera de alcance (no auditar como faltante):** registro y verificación de 18+, Stripe, estado `suspended` por falta de pago, gestión de usuarios en el panel, MinIO/subidas, suscripciones Web Push, IA, Instagram. Llegan en fases posteriores.

## 2. Infraestructura y supuestos de despliegue

- VPS con **Easypanel**. Traefik termina TLS y reenvía al contenedor en el puerto 3000.
- La misma imagen sirve para dos servicios: `ROLE=app` (migra y luego `node server.js`) y `ROLE=worker` (`node dist/worker.mjs`).
- Postgres es un servicio de Easypanel y solo se alcanza por la red interna.
- **Supuesto crítico:** la app solo se alcanza a través de Traefik. La IP del cliente se toma de `X-Forwarded-For` contando `TRUSTED_PROXY_HOPS` saltos desde la derecha (1 por defecto). Si el contenedor se expone directo, la IP es falsificable.
- El contenedor corre como usuario sin privilegios `nextjs` (uid 1001), con `tini` como PID 1.
- En local se usa PGlite (Postgres en WASM) con `DATABASE_POOL_MAX=1`. Es solo para desarrollo.

## 3. Inventario de archivos

| Ruta | Rol |
| --- | --- |
| `next.config.ts` | Salida standalone, cabeceras de seguridad (CSP, HSTS en prod, XFO, nosniff, Referrer-Policy, Permissions-Policy) y cabeceras de `/sw.js` |
| `src/proxy.ts` | Antes `middleware`. Comprobación **optimista** de que existe la cookie; redirige a `/login` o responde 401 en `/api/*`. Renueva el Max-Age de la cookie solo en GET |
| `src/lib/env.ts` | Validación de variables de entorno con zod (las vacías cuentan como no definidas) |
| `src/lib/db/schema.ts` · `drizzle/0000_init.sql` | Modelo de datos |
| `src/lib/db/index.ts` | Pool postgres-js de una instancia por proceso |
| `src/lib/auth/password.ts` | argon2id (m=19456 KiB, t=2, p=1), verificación contra un hash ficticio y contraseña temporal con `crypto.randomInt` |
| `src/lib/auth/password-rules.ts` | Política: 10–128 caracteres, al menos una letra y un número, sin la parte local del correo |
| `src/lib/auth/tokens.ts` | Token de 32 bytes aleatorios en base64url; en BD se guarda SHA-256 hex |
| `src/lib/auth/cookie.ts` | Nombre y opciones de la cookie |
| `src/lib/auth/session.ts` | Crear, validar (con expiración deslizante) e invalidar sesiones |
| `src/lib/auth/dal.ts` | `getCurrentSession` (cacheada por petición), `requireUser`, `requireAdmin` |
| `src/lib/auth/actions.ts` | Server Actions `loginAction`, `logoutAction`, `changePasswordAction` |
| `src/lib/auth/rate-limit.ts` | Límite de intentos por correo y por IP en una ventana de 15 min |
| `src/lib/request.ts` · `src/lib/safe-redirect.ts` | IP del cliente, user-agent y redirección segura |
| `src/lib/audit.ts` | Escritura en la bitácora; nunca lanza error |
| `src/app/**` | Páginas (ver §5) |
| `src/app/api/health/route.ts` | Comprobación de salud pública (`select 1`) |
| `public/sw.js` | Service worker |
| `src/worker/index.ts` | Worker pg-boss |
| `scripts/cli.ts` | `create-admin`, `reset-password`, `list-admins` |
| `scripts/migrate.ts` | Migrador |
| `Dockerfile` · `scripts/docker-entrypoint.sh` | Imagen |

## 4. Modelo de datos

- `users`: `id` uuid, `email` (índice único sobre `lower(email)`), `name`, `password_hash`, `role` enum(`creator`, `admin`) por defecto `creator`, `status` enum(`active`, `suspended`, `disabled`), `must_change_password`, `last_login_at` y marcas de tiempo.
- `sessions`: `id` = SHA-256 del token, `user_id` (FK con borrado en cascada), `expires_at`, `last_seen_at`, `user_agent` (truncado a 400) e `ip` inet.
- `login_attempts`: `email`, `ip` inet, `succeeded`, `created_at`. Índices `(email, created_at)` e `(ip, created_at)`.
- `audit_log`: `actor_user_id`, `target_user_id` (FK con `set null`), `action`, `meta` jsonb, `ip` y `created_at`.
- Esquema `pgboss`: lo crea pg-boss en tiempo de ejecución.

## 5. Rutas y autorización

| Ruta | Acceso | Control de servidor |
| --- | --- | --- |
| `/` | cualquiera | redirige según la sesión |
| `/login` | público | si hay una sesión válida, redirige a home |
| `/offline` | público, estática | — |
| `/api/health` | público | sin datos sensibles |
| `/cambiar-contrasena` | autenticado (permite `must_change_password`) | `requireUser({ allowPasswordChange: true })` |
| `/hoy` `/semana` `/grabar` `/progreso` `/mi-marca` | autenticado | `requireUser()` en el layout `(app)` **y** en cada página |
| `/admin` | admin | `requireAdmin()` en el layout y la página; responde **404** si no es admin |
| `/manifest.webmanifest`, `/sw.js`, `/icons/*`, `/brand/*` | público | fuera del matcher del proxy |

`requireUser` redirige a `/login` si no hay sesión, a `/login?error=desactivada` si `status = disabled`, y a `/cambiar-contrasena` si `must_change_password`. **El estado `suspended` no se aplica todavía** (llega en la Fase 1).

## 6. Flujos sensibles

**Inicio de sesión (`loginAction`)**
1. zod normaliza el correo (trim, minúsculas) y limita la contraseña a 128 caracteres.
2. **Reserva atómica del intento** (`reserveLoginAttempt`): dentro de una transacción toma `pg_advisory_xact_lock` por correo y luego por IP (sin IP se usa un cupo compartido "desconocida"). Cuenta los fallos de la ventana de 15 min (5 por correo, 25 por IP) e **inserta el intento como fallido antes de verificar la contraseña**. Si se superó el límite, no inserta, audita `auth.login_blocked` y responde con el mensaje de bloqueo.
3. Busca por `lower(email)`. Si no existe, verifica contra un hash argon2id **precalculado** (`DUMMY_HASH`) para igualar el tiempo de respuesta.
4. Un correo inexistente, una contraseña incorrecta o una cuenta `disabled` reciben **el mismo mensaje genérico**. La bitácora guarda `auth.login_failed` con `targetUserId` si existe (y `meta.reason = "disabled"` en ese caso). **No guarda el correo escrito.**
5. Si es correcto, el intento reservado se marca `succeeded = true`. Rotación: invalida la sesión previa de ese navegador, crea una nueva y fija la cookie.
6. Redirige a `next` solo si pasa `safeRedirectPath`. Es una **lista blanca**: `^/(?!/)[A-Za-z0-9\-._~/?=&%]*$`, sin `%2F` ni `%5C`, máximo 200 caracteres. Esto rechaza `\`, unicode y caracteres de control.
7. Ante un error, la acción devuelve el correo escrito para volver a llenar el campo (React 19 limpia el formulario tras cada envío).

**Cookie de sesión:** `__Host-pdq_session` en producción (`pdq_session` en desarrollo). HttpOnly, Secure (prod), SameSite=Lax, Path=/, Max-Age de 30 días. En BD la sesión dura 30 días y se extiende cuando le quedan menos de 15.

**Cambio de contraseña:** exige la contraseña actual (también cuando es temporal), aplica la política, impide repetir la actual, cierra **todas** las sesiones del usuario y crea una nueva.

**Cierre de sesión:** Server Action que borra la sesión en BD y la cookie.

**CSRF:** las Server Actions usan la verificación integrada de Next (Origin contra Host / X-Forwarded-Host). Se comprobó que un Origin ajeno se rechaza. No hay Route Handlers que muten estado.

**CLI:** genera una contraseña temporal de 14 caracteres (alfabeto sin ambiguos; se regenera completa hasta tener letra y dígito), marca `must_change_password`, borra las sesiones (en `reset-password`) y audita `cli.*`. La contraseña **solo se imprime si stdout es una terminal interactiva** (la consola de Easypanel, que no va a los logs del contenedor). En otro caso se escribe en un archivo de `tmpdir()` con permisos 600 (`flag: wx`) y solo se imprime la ruta.

**`/api/health`:** sin token responde siempre `{ ok: true }` (prueba de vida, no toca la BD). Con `Authorization: Bearer <HEALTH_TOKEN>` (comparación en tiempo constante) revisa también la BD y puede responder 503.

**CSP:** se genera en `src/proxy.ts` con un nonce aleatorio por petición: `script-src 'self' 'nonce-…' 'strict-dynamic'`, **sin `'unsafe-inline'` en scripts**. `style-src` conserva `'unsafe-inline'` porque los atributos `style` de React no admiten nonce. Todas las páginas se renderizan por petición (`await connection()` en el layout raíz) para que Next aplique el nonce. `/sw.js` tiene su propia CSP fija en `next.config.ts`.

## 7. PWA y service worker

- Solo intercepta navegaciones: primero la red y, si falla, `/offline` desde caché. No cachea HTML autenticado, API ni otros recursos.
- `push`: limita la longitud de título y cuerpo. La `url` solo se acepta si es una ruta interna (`/…`, no `//`). En `notificationclick` se vuelve a validar que sea del mismo origen.
- Se sirve con `Cache-Control: no-store` y solo se registra en producción.

## 8. Controles de seguridad ya implementados

Contraseñas con argon2id · tokens opacos con hash en BD · cookie `__Host-` · rotación de sesión en login y en cambio de contraseña · límite de intentos atómico por correo e IP · mensajes genéricos y tiempo igualado · redirección con lista blanca · autorización en la capa de datos (no solo en el proxy) · 404 para rutas de admin · CSP con nonce y `'strict-dynamic'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` y `form-action 'self'` · HSTS · validación de IP antes de guardarla en columnas `inet` · bitácora sin correos escritos y con retención · health sin revelar la BD · contenedor sin root · `server-only` en módulos de servidor.

## 9. Riesgos conocidos y decisiones conscientes (verificar o proponer mejoras)

1. **`style-src 'unsafe-inline'`.** Lo necesitan los atributos `style` de React y next/font. Riesgo bajo: no permite ejecutar scripts.
2. **Bloqueo de cuentas ajenas:** cualquiera puede bloquear 15 min el inicio de sesión de un correo con 5 intentos fallidos. Se aceptó esa compensación; no afecta a las sesiones ya abiertas.
3. **La IP depende de la topología** (ver §2). Si se pone Cloudflare delante, hay que poner `TRUSTED_PROXY_HOPS=2`. Está documentado como regla de operación en el README.
4. **Expiración deslizante de la cookie:** se renueva en cada GET que pasa por el proxy, lo que incluye las navegaciones RSC del cliente. Un usuario activo siempre genera GETs, así que la cookie no vence mientras use la app.
5. **Dependencias:** las de producción no tienen vulnerabilidades (`npm audit --omit=dev`). En desarrollo hay alertas en `braces` (vía eslint-config-next) y en un `esbuild` antiguo (vía drizzle-kit); ninguna entra en la imagen.
6. **`cacheComponents` desactivado** a propósito: es una app autenticada y dinámica, y así el renderizado es predecible.
7. **Las pantallas del creador muestran datos de ejemplo fijos**, sin datos de otros usuarios.
8. **El estado `suspended` existe en el esquema, pero no se aplica** hasta la Fase 1.
9. **Atomicidad del límite verificada con PGlite**, que tiene una sola conexión y por eso serializa todo. Conviene repetir la prueba de ráfaga contra el Postgres real de Easypanel (ver §11).

## 10. Qué conviene revisar en la auditoría

- Que **ninguna** página ni acción dependa solo de `proxy.ts`.
- Fijación de sesión, reutilización de cookies viejas tras cambiar la contraseña y cierre de sesión real.
- `safeRedirectPath` frente a codificaciones (`/%2F%2Fevil.com`, `/%5Cevil.com`, unicode).
- `clientIpFromForwarded` y la manipulación de `X-Forwarded-For`.
- Límites de longitud en todas las entradas (correo hasta 254, contraseña hasta 128; argon2 con entradas largas).
- Que las cabeceras de `next.config.ts` lleguen a todas las respuestas, incluidos errores y la 404.
- Que el service worker no pueda servir contenido autenticado desde caché a otro usuario del mismo dispositivo.
- Que la Dockerfile no copie secretos (`.dockerignore` excluye `.env*`) y que la imagen final no tenga devDependencies.
- La validación zod en `env.ts` y que no se filtren secretos al cliente (no hay variables `NEXT_PUBLIC_*`).

## 11. Cómo reproducir

```bash
npm install && cp .env.example .env.local
npm run db:local                # otra terminal
npm run db:migrate
npm run cli -- create-admin admin@test.com "Admin Test"
npm run dev
npm test && npm run typecheck && npm run lint && npm run build
```

Pruebas automatizadas (25): tokens, política y hash de contraseñas, redirecciones seguras (incluye `/%2F%2Fevil.com`, `/%5Cevil.com`, `\`, RTL override y caracteres de ancho completo), IP detrás de proxy, y migraciones sobre PGlite (unicidad de correo sin distinguir mayúsculas, cascada de sesiones, validación de `inet`).

Verificaciones de la remediación (build de producción + Edge):
- **Ráfaga de 20 inicios de sesión simultáneos** al mismo correo desde 20 IP distintas: **5 evaluados y 15 bloqueados**.
- La CSP lleva un nonce distinto en cada petición, sin `'unsafe-inline'` en scripts. Todos los `<script>` llevan nonce, hay cero violaciones de CSP en consola y la navegación del lado del cliente funciona.
- `/api/health`: sin token o con token incorrecto → `{ ok: true }`; con token → `{ ok: true, db: true }`.
- Tras un error de inicio de sesión, el correo se conserva y el reintento con la contraseña correcta entra.

Verificaciones manuales hechas en esta fase:
- Inicio de sesión con error genérico, correo en mayúsculas y bloqueo de `next=//evil.com`.
- Cambio de contraseña obligatorio y rotación de cookie; la cookie anterior queda inválida.
- Bloqueo al 6.º intento y rechazo de una Server Action con Origin ajeno.
- Build de producción: la cookie sale con `__Host-` + Secure + HttpOnly y se envían HSTS y CSP.
- Ninguna pantalla se desborda horizontalmente a 360 px.

## 12. Respuesta a la auditoría 1 (2026-10-14)

| ID | Resolución | Detalle |
| --- | --- | --- |
| AUD-001 | **Corregido** | `reserveLoginAttempt`: transacción con `pg_advisory_xact_lock` por correo e IP; el intento se inserta antes de verificar la contraseña. Ráfaga de 20 simultáneos → 5 evaluados. |
| AUD-002 | **Corregido** | CSP con nonce por petición en `proxy.ts`, `'strict-dynamic'`, sin `'unsafe-inline'` en scripts. Páginas dinámicas con `connection()`. |
| AUD-003 | **Mitigado (operación)** | El diseño es correcto (se cuenta desde la derecha). Se agregó la regla de operación al README. No hay forma fiable de autodetectar la cantidad de saltos desde la app. |
| AUD-004 | **Corregido** | Sin token: solo prueba de vida, nunca toca la BD. Con `HEALTH_TOKEN`: revisión de BD. |
| AUD-005 | **Corregido (riesgo sobrestimado)** | La consola de Easypanel es una sesión `exec` interactiva y su salida no va a los logs del contenedor. Aun así, sin TTY la contraseña va a un archivo con permisos 600 y no se imprime. |
| AUD-006 | **Corregido** | Ya no se guarda el correo escrito en `audit_log.meta`. El worker purga la bitácora según `AUDIT_RETENTION_DAYS` (365 por defecto). |
| AUD-007 | **Corregido** | Una cuenta desactivada recibe el mensaje genérico; el motivo queda solo en la bitácora. |
| AUD-008 | **No aplica** | Las navegaciones del cliente (RSC) son GET y pasan por el proxy, que renueva la cookie. Un usuario activo no puede pasar 30 días haciendo solo POST. |
| AUD-009 | **Endurecido** | No era explotable: `Location: /%2F%2Fevil.com` es una ruta interna para el navegador. Aun así se pasó a lista blanca y se agregaron pruebas. |
| AUD-010 | **Sin cambios** | La auditoría confirma que los límites ya estaban (254 / 128). |
| AUD-011 | **No aplica** | `PushEvent` no tiene propiedad `origin`: el servicio de push solo entrega mensajes al service worker del origen que se suscribió con nuestra llave VAPID. La URL ya se valida en `push` y otra vez en `notificationclick`. |
| AUD-012 | **Aceptado** | Next valida Origin contra Host / X-Forwarded-Host; además la cookie es SameSite=Lax, así que un POST entre sitios no la lleva. Se verificó el rechazo de un Origin ajeno. Se agregará una prueba de regresión automatizada cuando haya pruebas e2e (Fase 7). |
| AUD-013 | **Parcialmente incorrecto; hueco real corregido** | El tope de 25 fallos por IP ya limitaba las filas que puede generar una IP (los intentos bloqueados no se insertan). El hueco real era que las peticiones **sin IP** se saltaban ese tope: ahora comparten un cupo. |
| AUD-014 | **Corregido** | El worker registra `worker.cleanup` en la bitácora con los conteos. |
| AUD-015 | **No aplica** | El healthcheck consulta `127.0.0.1` dentro del propio contenedor: no hay TLS que validar. Sin token, `/api/health` ya no depende de la BD, así que no habrá reinicios por caídas de Postgres. |
| AUD-016 | **Mitigado** | Si en producción el pool es menor a 3, se registra una advertencia en el log. Además está documentado en el README. |
| AUD-017 | **Corregido** | La contraseña temporal se regenera completa en lugar de reemplazar un carácter. |
| AUD-018 | **Corregido** | El hash de comparación está precalculado como constante. |
| AUD-019 | **Aceptado** | Afecta solo a desarrollo con HTTPS local, que no se usa. |

Hallazgo propio durante la remediación: React 19 limpiaba el formulario de inicio de sesión tras un error y el reintento salía con el correo vacío. Se corrigió devolviendo el correo en el estado de la acción.
