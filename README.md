# Punto de Quiebre · App de creadores

PWA para creadores de contenido que empiezan su marca personal. Next.js 16 + TypeScript + Postgres (Drizzle) + pg-boss, desplegada en Easypanel.

El desarrollo va por fases. Cada fase deja un documento de contexto para auditoría en [`docs/fases/`](docs/fases/).

| Fase | Estado |
| --- | --- |
| 0 · Cimientos (proyecto, BD, inicio de sesión, diseño, PWA, shell, admin mínimo, Docker) | En revisión |
| 1 · Base (registro, 18+, Stripe, compromiso, admin de clientes) | Pendiente |

## Desarrollo local (Windows, sin Docker)

Requisitos: Node 22.12 o superior.

```bash
npm install
cp .env.example .env.local      # ya trae valores para trabajar en local

# Terminal 1: Postgres embebido (PGlite) en 127.0.0.1:5432, datos en ./.pglite
npm run db:local

# Terminal 2
npm run db:migrate
npm run cli -- create-admin tu@correo.com "Tu Nombre"   # imprime una contraseña temporal
npm run dev                                             # http://localhost:3000
```

Con PGlite deja `DATABASE_POOL_MAX=1`: el Postgres embebido tiene un solo proceso y mezcla consultas simultáneas. En Easypanel no aplica.

Otros comandos:

| Comando | Para qué |
| --- | --- |
| `npm run worker:dev` | Worker de tareas en local |
| `npm run db:generate` | Genera una migración SQL después de cambiar `src/lib/db/schema.ts` |
| `npm test` · `npm run typecheck` · `npm run lint` | Calidad |
| `npm run brand:assets` | Regenera los SVG de marca y los íconos de la PWA |

## Despliegue en Easypanel

Una sola imagen (`Dockerfile`) sirve para dos servicios:

1. **Postgres** → crea el servicio `pdq-db`. Copia su *Internal Connection URL*.
2. **App** → servicio `pdq-app` desde el repositorio de GitHub, build con **Dockerfile**.
   - Variables: `DATABASE_URL` (la URL interna), `APP_URL` (p. ej. `https://app.dominio.com`), `TRUSTED_PROXY_HOPS=1`.
   - Dominio con HTTPS. **El puerto del dominio debe ser el mismo en el que escucha la app**: la app usa la variable `PORT` (3000 por defecto), pero Easypanel puede inyectar `PORT=80`. Revisa en los logs la línea `- Local: http://localhost:XX` y pon ese mismo puerto en el dominio.
   - Al arrancar aplica las migraciones solo.
3. **Worker** → servicio `pdq-worker`, mismo repositorio y Dockerfile, mismas variables más **`ROLE=worker`**. Sin dominio.
4. **Primer administrador**: en la consola de `pdq-app`:
   ```bash
   node dist/cli.mjs create-admin admin@dominio.com "Nombre Apellido"
   ```
   Se imprime una contraseña temporal; al entrar, la app obliga a cambiarla.
   Para restablecer una contraseña mientras llega el panel: `node dist/cli.mjs reset-password correo@dominio.com`.

MinIO (archivos) y las llaves VAPID (notificaciones) se agregan en las fases que los usan.

### Reglas de operación

- **Proxies delante de la app.** `TRUSTED_PROXY_HOPS` debe ser igual al número de proxies entre internet y la app: `1` con Easypanel/Traefik solo, `2` si se pone Cloudflare (u otro CDN) delante. Si no coincide, la IP del cliente se puede falsificar y el límite de intentos por IP pierde efecto. **Cualquier cambio de DNS/CDN obliga a revisar esta variable.**
- **No expongas el puerto de Postgres** ni el 3000 de la app fuera de la red interna de Easypanel.
- **`DATABASE_POOL_MAX`** no se define en producción (por defecto 10). Si aparece en 1, la app lo advierte en el log.
- **Monitoreo:** `GET /api/health` sin token solo indica que el proceso vive. Para revisar también la base de datos, define `HEALTH_TOKEN` (24+ caracteres) y llama con `Authorization: Bearer <token>`.
- **Bitácora:** se conserva `AUDIT_RETENTION_DAYS` días (365 por defecto); el worker la purga a diario.

## Estructura

```
src/app/(auth)/login        Inicio de sesión
src/app/(app)/…             Hoy · Semana · Grabar · Progreso · Mi marca
src/app/admin               Panel de administrador
src/app/cambiar-contrasena  Cambio de contraseña (obligatorio con contraseña temporal)
src/lib/auth                Sesiones, contraseñas, límite de intentos, DAL, Server Actions
src/lib/db                  Esquema Drizzle y conexión
src/components/brand        Logotipo, isotipo y avatar (trazos oficiales del manual)
src/components/ui           Sistema de diseño
src/worker                  Worker pg-boss
scripts/                    Migraciones, CLI de admin, empaquetado, generador de marca
drizzle/                    Migraciones SQL versionadas
public/sw.js                Service worker (offline + push)
```
