#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Ensuring Docker services are running..."
docker compose -f docker-compose.yml -p neighborhoodpickup up --build -d --remove-orphans db backend frontend

echo "Running tests in Docker..."
docker compose -f docker-compose.yml -p neighborhoodpickup run --rm --build tests

echo "All tests completed successfully."
