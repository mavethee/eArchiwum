#!/bin/bash

# e-Archiwum Cleanup Script
# Stops all services and removes containers/volumes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

echo "🧹 e-Archiwum Cleanup"
echo "================================"
echo ""

# Kill any running processes on dev ports
echo "Stopping processes..."
lsof -i :3000 2>/dev/null | grep -v COMMAND | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true
lsof -i :5173 2>/dev/null | grep -v COMMAND | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true
log_info "Processes stopped"
echo ""

# Stop and remove PostgreSQL container
echo "Managing Docker containers..."
CONTAINER_NAME="e-archiwum-postgres"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  log_info "Stopped PostgreSQL container"
  
  # Ask to remove
  read -p "Remove PostgreSQL container and data volume? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
    docker volume rm e-archiwum-db-data 2>/dev/null || true
    log_info "Removed container and volume"
  else
    log_warn "Container and volume preserved"
  fi
else
  log_warn "PostgreSQL container not found"
fi
echo ""

# Clean build artifacts (optional)
read -p "Clean build artifacts (node_modules, out, dist)? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  cd "$PROJECT_ROOT"
  rm -rf node_modules out dist 2>/dev/null || true
  log_info "Build artifacts cleaned"
else
  log_warn "Build artifacts preserved"
fi
echo ""

echo "================================"
log_info "Cleanup completed"
echo ""
echo "To setup again: ./scripts/setup.sh"
