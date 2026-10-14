#!/bin/sh
set -e

if [ "$ROLE" = "worker" ]; then
  echo "[entrypoint] iniciando worker"
  exec node dist/worker.mjs
fi

echo "[entrypoint] aplicando migraciones"
node dist/migrate.mjs
echo "[entrypoint] iniciando app"
exec node server.js
