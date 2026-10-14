# CONTEXT · Fase 0 — Cimientos

> Documento para la IA que audita vulnerabilidades y errores de esta fase.
> Fecha: 2026-10-14 · Versión de la app: 0.1.0 · Estado: pendiente de aprobación.

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
2. Revisa el límite: 5 fallos por correo o 25 por IP en 15 min bloquean el intento y se audita `auth.login_blocked`.
3. Busca por `lower(email)`. Si no existe, verifica contra un hash ficticio para igualar el tiempo de respuesta. El error es genérico.
4. Un usuario `disabled` recibe un mensaje específico, pero solo si la contraseña era correcta.
5. Rotación: invalida la sesión previa de ese navegador, crea una nueva y fija la cookie.
6. Redirige a `next` solo si pasa `safeRedirectPath`: debe empezar con `/`, no con `//` ni `/\`, sin caracteres de control y con máximo 200 caracteres.

**Cookie de sesión:** `__Host-pdq_session` en producción (`pdq_session` en desarrollo). HttpOnly, Secure (prod), SameSite=Lax, Path=/, Max-Age de 30 días. En BD la sesión dura 30 días y se extiende cuando le quedan menos de 15.

**Cambio de contraseña:** exige la contraseña actual (también cuando es temporal), aplica la política, impide repetir la actual, cierra **todas** las sesiones del usuario y crea una nueva.

**Cierre de sesión:** Server Action que borra la sesión en BD y la cookie.

**CSRF:** las Server Actions usan la verificación integrada de Next (Origin contra Host / X-Forwarded-Host). Se comprobó que un Origin ajeno se rechaza. No hay Route Handlers que muten estado.

**CLI:** genera una contraseña temporal de 14 caracteres (alfabeto sin ambiguos, al menos un dígito), marca `must_change_password`, borra las sesiones (en `reset-password`) y audita `cli.*`. La contraseña se imprime en stdout.

## 7. PWA y service worker

- Solo intercepta navegaciones: primero la red y, si falla, `/offline` desde caché. No cachea HTML autenticado, API ni otros recursos.
- `push`: limita la longitud de título y cuerpo. La `url` solo se acepta si es una ruta interna (`/…`, no `//`). En `notificationclick` se vuelve a validar que sea del mismo origen.
- Se sirve con `Cache-Control: no-store` y solo se registra en producción.

## 8. Controles de seguridad ya implementados

Contraseñas con argon2id · tokens opacos con hash en BD · cookie `__Host-` · rotación de sesión en login y en cambio de contraseña · límite de intentos por correo e IP · errores genéricos y tiempo igualado · protección contra redirecciones abiertas · autorización en la capa de datos (no solo en el proxy) · 404 para rutas de admin · CSP con `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` y `form-action 'self'` · HSTS · validación de IP antes de guardarla en columnas `inet` · contenedor sin root · `server-only` en módulos de servidor.

## 9. Riesgos conocidos y decisiones conscientes (verificar o proponer mejoras)

1. **CSP con `'unsafe-inline'` en `script-src`.** Next inyecta scripts en línea; no se implementó nonce porque obliga a renderizar todo dinámicamente. Evaluar el nonce vía `proxy.ts`.
2. **Bloqueo de cuentas ajenas:** cualquiera puede bloquear 15 min el inicio de sesión de un correo con 5 intentos fallidos. Se aceptó esa compensación; no afecta a las sesiones ya abiertas.
3. **Condición de carrera en el límite:** primero se consulta y después se inserta. Con peticiones concurrentes pueden pasar más de 5 intentos en la ventana.
4. **Enumeración limitada:** el mensaje de cuenta desactivada solo aparece con la contraseña correcta.
5. **La IP depende de la topología** (ver §2). Si se pone Cloudflare delante, hay que poner `TRUSTED_PROXY_HOPS=2`.
6. **`audit_log` guarda el correo intentado** en `meta` (dato personal) y no tiene política de retención. `login_attempts` se purga a los 30 días.
7. **`/api/health` es público** y revela si la BD responde.
8. **La CLI imprime la contraseña temporal** en la consola del contenedor.
9. **Expiración deslizante:** la BD se extiende en el render, pero la cookie solo se renueva en peticiones GET que pasan por el proxy.
10. **Dependencias:** las de producción no tienen vulnerabilidades (`npm audit --omit=dev`). En desarrollo hay alertas en `braces` (vía eslint-config-next) y en un `esbuild` antiguo (vía drizzle-kit); ninguna entra en la imagen.
11. **`cacheComponents` desactivado** a propósito: es una app autenticada y dinámica, y así el renderizado es predecible.
12. **Las pantallas del creador muestran datos de ejemplo fijos**, sin datos de otros usuarios.
13. **El estado `suspended` existe en el esquema, pero no se aplica** hasta la Fase 1.

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

Pruebas automatizadas (18): tokens, política y hash de contraseñas, redirecciones seguras, IP detrás de proxy, y migraciones sobre PGlite (unicidad de correo sin distinguir mayúsculas, cascada de sesiones, validación de `inet`).

Verificaciones manuales hechas en esta fase:
- Inicio de sesión con error genérico, correo en mayúsculas y bloqueo de `next=//evil.com`.
- Cambio de contraseña obligatorio y rotación de cookie; la cookie anterior queda inválida.
- Bloqueo al 6.º intento y rechazo de una Server Action con Origin ajeno.
- Build de producción: la cookie sale con `__Host-` + Secure + HttpOnly y se envían HSTS y CSP.
- Ninguna pantalla se desborda horizontalmente a 360 px.
