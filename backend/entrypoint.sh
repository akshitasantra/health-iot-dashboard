#!/usr/bin/env bash
set -e

# wait-for-postgres (simple loop; replace with wait-for-it or pg_isready if you prefer)
if [ -n "$DATABASE_URL" ]; then
  echo "Waiting for database to be ready..."
  # extract host and port (rough parsing, works for normal postgres URLs)
  host=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|' || true)
  port=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|' || echo 5432)
  # fallback
  if [ -z "$host" ]; then host="localhost"; fi
  if [ -z "$port" ]; then port=5432; fi

  # try to reach it (timeout total ~60s)
  for i in $(seq 1 60); do
    if nc -z "$host" "$port" >/dev/null 2>&1; then
      echo "DB reachable"
      break
    fi
    echo "Waiting for DB... ($i)"
    sleep 1
  done
fi

# Run prisma migrate deploy (idempotent for production)
if [ -f ./prisma/schema.prisma ]; then
  echo "Running prisma generate + migrate deploy..."
  npx prisma generate
  npx prisma migrate deploy || true
fi

# start the server
echo "Starting server..."
node server.js
