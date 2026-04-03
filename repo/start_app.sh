#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Starting NeighborhoodPickup services in detached mode..."
docker compose -f docker-compose.yml -p neighborhoodpickup up -d --build --remove-orphans

echo ""
echo "Services started. Use the following to view logs:"
echo "  docker compose -p neighborhoodpickup logs -f"
echo ""
echo "To stop and remove services:"
echo "  docker compose -f docker-compose.yml -p neighborhoodpickup down --volumes --remove-orphans"
