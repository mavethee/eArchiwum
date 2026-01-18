#!/bin/bash

# e-Archiwum Development Setup (Offline Mode)
# For quick testing without database

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔧 e-Archiwum Development Setup (Offline)"
echo "================================"
echo ""

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

# Check prerequisites
echo "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { log_error "Node.js not installed"; exit 1; }
command -v npm >/dev/null 2>&1 || { log_error "npm not installed"; exit 1; }
log_info "Node.js version: $(node -v)"
log_info "npm version: $(npm -v)"
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

# Verify TypeScript compilation
echo "Verifying TypeScript compilation..."
npx tsc --noEmit >/dev/null 2>&1 || { log_error "TypeScript compilation failed"; exit 1; }
log_info "TypeScript compilation successful"
echo ""

# Verify ESLint
echo "Verifying code quality..."
npm run lint >/dev/null 2>&1 || { log_warn "ESLint found minor issues"; }
log_info "Code quality check completed"
echo ""

# Build Electron
echo "Building Electron application..."
npm run build >/dev/null 2>&1 || { log_error "Electron build failed"; exit 1; }
log_info "Electron build successful"
echo ""

# Create logs directory
mkdir -p "$PROJECT_ROOT/logs"
log_info "Created logs directory"
echo ""

# Create .env file if not exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
  log_info "Created .env file"
else
  log_warn ".env file already exists"
fi
echo ""

echo "================================"
echo -e "${GREEN}✓ Development setup completed!${NC}"
echo ""
echo "⚠️  OFFLINE MODE - Database features disabled"
echo ""
echo "Setup complete. You can:"
echo "  • Review code and make changes"
echo "  • Run tests: npm run test"
echo "  • Check types: npm run typecheck"
echo "  • Lint code: npm run lint"
echo ""
echo "When database is available, run:"
echo "  ./scripts/setup-quick.sh  (local PostgreSQL)"
echo "  ./scripts/setup.sh         (Docker)"
echo ""
