#!/bin/sh
# Chequeo de salud del contenedor. Usa el puerto real (Easypanel puede inyectar PORT=80).
# El worker no expone HTTP: siempre sano mientras el proceso viva.
[ "$ROLE" = "worker" ] && exit 0
wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null || exit 1
