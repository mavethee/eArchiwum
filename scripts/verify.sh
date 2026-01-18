#!/bin/bash

# e-Archiwum Verify Script
# Comprehensive health check of all components

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
WARN=0
FAIL=0

log_pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((PASS++))
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
  ((WARN++))
}

log_fail() {
  echo -e "${RED}✗${NC} $1"
  ((FAIL++))
}

log_header() {
  echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

echo "🔍 e-Archiwum Verification"
echo "================================"
echo ""

cd "$PROJECT_ROOT"

# 1. Environment
log_header "Environment"
command -v node >/dev/null 2>&1 && log_pass "Node.js: $(node -v)" || log_fail "Node.js not found"
command -v npm >/dev/null 2>&1 && log_pass "npm: $(npm -v)" || log_fail "npm not found"
command -v docker >/dev/null 2>&1 && log_pass "Docker: $(docker --version)" || log_fail "Docker not found"
echo ""

# 2. Project Structure
log_header "Project Structure"
[ -f "package.json" ] && log_pass "package.json exists" || log_fail "package.json missing"
[ -f "tsconfig.json" ] && log_pass "tsconfig.json exists" || log_fail "tsconfig.json missing"
[ -f "electron.vite.config.ts" ] && log_pass "electron.vite.config.ts exists" || log_fail "electron.vite.config.ts missing"
[ -d "src" ] && log_pass "src/ directory exists" || log_fail "src/ directory missing"
[ -f ".env.example" ] && log_pass ".env.example exists" || log_fail ".env.example missing"
echo ""

# 3. Dependencies
log_header "Dependencies"
if [ -d "node_modules" ]; then
  log_pass "node_modules exists"
  PACKAGE_COUNT=$(find node_modules -maxdepth 1 -type d | wc -l)
  log_pass "Installed packages: ~$PACKAGE_COUNT"
else
  log_fail "node_modules not found - run: npm install"
fi
echo ""

# 4. TypeScript & Linting
log_header "Code Quality"
if npx tsc --noEmit >/dev/null 2>&1; then
  log_pass "TypeScript compilation OK"
else
  log_fail "TypeScript compilation errors"
fi

if npm run lint >/dev/null 2>&1; then
  log_pass "ESLint OK"
else
  log_warn "ESLint found issues"
fi
echo ""

# 5. Database
log_header "Database"
CONTAINER_NAME="e-archiwum-postgres"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  CONTAINER_STATE=$(docker ps -a --format '{{.Names}}:{{.State}}' | grep "$CONTAINER_NAME" | cut -d: -f2)
  
  if [ "$CONTAINER_STATE" = "running" ]; then
    log_pass "PostgreSQL container is running"
    
    if docker exec "$CONTAINER_NAME" pg_isready -U archiwum -d e_archiwum_dev >/dev/null 2>&1; then
      log_pass "PostgreSQL connection OK"
      
      # Check if schema exists
      TABLES=$(docker exec "$CONTAINER_NAME" psql -U archiwum -d e_archiwum_dev -tc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null)
      if [ ! -z "$TABLES" ] && [ "$TABLES" -gt 0 ]; then
        log_pass "Database schema initialized ($TABLES tables)"
      else
        log_warn "Database schema not initialized"
      fi
    else
      log_fail "PostgreSQL connection failed"
    fi
  else
    log_warn "PostgreSQL container exists but not running (state: $CONTAINER_STATE)"
  fi
else
  log_warn "PostgreSQL container not found - run: ./scripts/setup.sh"
fi
echo ""

# 6. Build
log_header "Build"
if [ -d "out/main" ] && [ -d "out/preload" ]; then
  log_pass "Build output exists"
  
  if [ -f "out/main/index.js" ]; then
    SIZE=$(du -h "out/main/index.js" | cut -f1)
    log_pass "Main build: $SIZE"
  fi
  
  if [ -f "out/preload/index.js" ]; then
    SIZE=$(du -h "out/preload/index.js" | cut -f1)
    log_pass "Preload build: $SIZE"
  fi
else
  log_warn "Build output not found - run: npm run build"
fi
echo ""

# 7. Ports
log_header "Ports"
if ! lsof -i :3000 >/dev/null 2>&1; then
  log_pass "Port 3000 is available"
else
  log_warn "Port 3000 is in use"
fi

if ! lsof -i :5173 >/dev/null 2>&1; then
  log_pass "Port 5173 is available"
else
  log_warn "Port 5173 is in use"
fi
echo ""

# 8. Logs
log_header "Logs"
LOGS_DIR="$PROJECT_ROOT/logs"
if [ -d "$LOGS_DIR" ]; then
  LOG_SIZE=$(du -sh "$LOGS_DIR" | cut -f1)
  LOG_COUNT=$(find "$LOGS_DIR" -type f | wc -l)
  log_pass "Logs directory: $LOG_SIZE ($LOG_COUNT files)"
else
  log_warn "Logs directory not found"
fi
echo ""

# Summary
log_header "Summary"
echo -e "${GREEN}Passed: $PASS${NC}"
[ $WARN -gt 0 ] && echo -e "${YELLOW}Warnings: $WARN${NC}"
[ $FAIL -gt 0 ] && echo -e "${RED}Failed: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "================================"
  echo -e "${GREEN}✓ All critical checks passed!${NC}"
  echo ""
  echo "You can start the application with:"
  echo "  ./scripts/start.sh"
  exit 0
else
  echo "================================"
  echo -e "${RED}✗ Some critical checks failed${NC}"
  echo ""
  echo "Run setup first:"
  echo "  ./scripts/setup.sh"
  exit 1
fi
