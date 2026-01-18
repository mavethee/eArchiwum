#!/bin/bash

# e-Archiwum Setup Script
# Initializes project from scratch

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔧 e-Archiwum Setup"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

# Check prerequisites
echo "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { log_error "Node.js not installed"; exit 1; }
command -v npm >/dev/null 2>&1 || { log_error "npm not installed"; exit 1; }
command -v docker >/dev/null 2>&1 || { log_error "Docker not installed"; exit 1; }
log_info "Prerequisites satisfied"
echo ""

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  log_error "Node.js 18+ required, got $(node -v)"
  exit 1
fi
log_info "Node.js version: $(node -v)"
echo ""

# Clean previous installations
echo "Cleaning previous installations..."
cd "$PROJECT_ROOT"
rm -rf node_modules package-lock.json out dist 2>/dev/null || true
log_info "Cleaned build artifacts"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install --legacy-peer-deps >/dev/null 2>&1 || { log_error "npm install failed"; exit 1; }
log_info "Dependencies installed"
echo ""

# Check PostgreSQL availability
echo "Setting up database..."

# Try Docker first, fall back to local
USE_DOCKER=true
if ! command -v docker >/dev/null 2>&1; then
  USE_DOCKER=false
fi

if [ "$USE_DOCKER" = true ]; then
  CONTAINER_NAME="e-archiwum-postgres"
  
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
    log_warn "Stopping existing PostgreSQL container..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    sleep 2
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
  fi
  
  # Start new PostgreSQL container
  docker run -d \
    --name "$CONTAINER_NAME" \
    -e POSTGRES_USER=archiwum \
    -e POSTGRES_PASSWORD=archiwum_dev \
    -e POSTGRES_DB=e_archiwum_dev \
    -p 5432:5432 \
    -v e-archiwum-db-data:/var/lib/postgresql/data \
    postgres:15-alpine \
    >/dev/null 2>&1 || { log_error "Failed to start PostgreSQL container"; exit 1; }
  
  log_info "PostgreSQL container started (Docker)"
  
  # Wait for PostgreSQL to be ready
  echo "Waiting for PostgreSQL to be ready..."
  RETRY=0
  MAX_RETRIES=30
  while [ $RETRY -lt $MAX_RETRIES ]; do
    if docker exec "$CONTAINER_NAME" pg_isready -U archiwum -d e_archiwum_dev >/dev/null 2>&1; then
      log_info "PostgreSQL is ready"
      break
    fi
    RETRY=$((RETRY + 1))
    sleep 1
    if [ $((RETRY % 10)) -eq 0 ]; then
      echo "  Still waiting... ($RETRY/$MAX_RETRIES)"
    fi
  done
  
  if [ $RETRY -eq $MAX_RETRIES ]; then
    log_error "PostgreSQL failed to start after ${MAX_RETRIES}s"
    exit 1
  fi
  
  # Initialize database schema
  echo "Initializing database schema..."
  docker cp "$PROJECT_ROOT/src/main/database/schema.sql" "$CONTAINER_NAME":/tmp/schema.sql
  docker exec "$CONTAINER_NAME" psql -U archiwum -d e_archiwum_dev -f /tmp/schema.sql >/dev/null 2>&1 || {
    log_warn "Schema initialization had warnings (may be expected for existing tables)"
  }
  log_info "Database schema initialized (Docker)"
else
  log_warn "Docker not available, skipping Docker PostgreSQL setup"
  log_info "Ensure PostgreSQL is running locally with:"
  log_info "  - User: archiwum"
  log_info "  - Password: archiwum_dev"
  log_info "  - Database: e_archiwum_dev"
  log_info "  - Host: localhost:5432"
fi
echo ""

# Verify TypeScript compilation
echo "Verifying TypeScript compilation..."
npx tsc --noEmit >/dev/null 2>&1 || { log_error "TypeScript compilation failed"; exit 1; }
log_info "TypeScript compilation successful"
echo ""

# Verify ESLint
echo "Verifying code quality..."
npm run lint >/dev/null 2>&1 || { log_warn "ESLint found issues"; }
log_info "Code quality check completed"
echo ""

# Build Electron
echo "Building Electron application..."
npm run build >/dev/null 2>&1 || { log_error "Electron build failed"; exit 1; }
log_info "Electron build successful"
echo ""

echo "================================"
echo -e "${GREEN}✓ Setup completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. Start the application: ./scripts/start.sh"
echo "  2. View logs: tail -f logs/app.log"
echo ""
