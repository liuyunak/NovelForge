#!/bin/sh
set -e

# ============================================================
# NovelForge Docker Entrypoint
#
# Optional first-run initialisation, then start the server.
#
# The default Dockerfile uses `CMD ["node", "dist/index.js"]` directly and
# does NOT reference this script. It is provided for deployments that want
# the init step to run automatically on a fresh data volume — wire it up
# with `ENTRYPOINT ["docker-entrypoint.sh"]` if you need that behaviour.
# ============================================================

# Run first-run initialisation only once per persistent data volume.
if [ ! -f /app/data/.initialized ]; then
  echo "[NovelForge] First run — initialising directories and config..."
  # scripts/init.ts is NOT compiled into dist/ (tsconfig only includes src/),
  # and the production image has no tsx, so we do the lightweight init inline.
  mkdir -p /app/data /app/workspace /app/logs
  if [ ! -f /app/.env ] && [ -f /app/.env.example ]; then
    cp /app/.env.example /app/.env
    echo "[NovelForge] Created .env from template — run the Setup Wizard to configure."
  fi
  touch /app/data/.initialized
fi

echo "[NovelForge] Starting server..."
# Run the compiled backend. tsconfig has rootDir=./src and outDir=./dist,
# so the entry src/index.ts compiles to dist/index.js (NOT dist/src/index.js).
exec node dist/index.js
