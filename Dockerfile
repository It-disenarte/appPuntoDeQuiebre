# syntax=docker/dockerfile:1
# Imagen única para los dos servicios de Easypanel:
#   pdq-app    → ROLE=app (por defecto): aplica migraciones y arranca Next.js
#   pdq-worker → ROLE=worker: procesa la cola de tareas (pg-boss)

FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/drizzle
# ffmpeg: une las partes grabadas en un solo video (y servirá para la edición automática).
RUN apk add --no-cache libc6-compat tini ffmpeg \
 && addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/skills ./skills
# argon2 es nativo: se copia completo (incluye el binario para Alpine/musl).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@node-rs ./node_modules/@node-rs
# sharp (fotos del kit visual) también es nativo: se copia con su binario para Alpine y sus dependencias.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/detect-libc ./node_modules/detect-libc
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/semver ./node_modules/semver
COPY --chown=nextjs:nodejs scripts/docker-entrypoint.sh scripts/healthcheck.sh ./

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["sh", "./healthcheck.sh"]
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "./docker-entrypoint.sh"]
