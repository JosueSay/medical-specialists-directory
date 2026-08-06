#!/bin/sh
# Punto de entrada del contenedor de firebase-tools.
#
# Los hooks predeploy compilan el workspace con pnpm, asi que las dependencias
# tienen que existir dentro del contenedor. Se instalan solo si faltan: en la
# segunda invocacion el arranque es inmediato.
set -e

if [ ! -d /app/node_modules ]; then
  echo "Instalando dependencias del workspace (solo la primera vez)..."
  pnpm install --frozen-lockfile --prefer-offline
fi

exec firebase "$@"
