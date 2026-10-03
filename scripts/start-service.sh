#!/bin/sh
set -eu

case "${SERVICE_ROLE:-api}" in
  api)
    # Railway starts the API independently from PostGIS. A failed migration
    # fails this deployment rather than serving an incompatible schema.
    npx prisma migrate deploy
    node dist/packages/database/prisma/seed.js
    exec node dist/apps/api/src/index.js
    ;;
  worker)
    exec node dist/apps/worker/src/index.js
    ;;
  *)
    echo "SERVICE_ROLE must be either 'api' or 'worker', received: ${SERVICE_ROLE:-}" >&2
    exit 1
    ;;
esac
