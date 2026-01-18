#!/bin/bash

# ============================================================================
# e-Archiwum Project Startup Script
# ============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🚀 Starting e-Archiwum Project${NC}"
echo ""

# ============================================================================
# 1. Check Docker
# ============================================================================
echo -e "${YELLOW}1️⃣  Checking Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install Docker.${NC}"
    exit 1
fi

if ! docker ps &> /dev/null; then
    echo -e "${RED}❌ Docker daemon not running. Please start Docker.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker is running${NC}"

# ============================================================================
# 2. Check/Start PostgreSQL
# ============================================================================
echo ""
echo -e "${YELLOW}2️⃣  Checking PostgreSQL container...${NC}"

POSTGRES_RUNNING=$(docker ps | grep "postgres" | awk '{print $1}')

if [ -z "$POSTGRES_RUNNING" ]; then
    echo -e "${YELLOW}   PostgreSQL not running. Starting...${NC}"
    docker-compose up -d postgres
    sleep 3
    POSTGRES_RUNNING=$(docker ps | grep "postgres" | awk '{print $1}')
fi

if [ -z "$POSTGRES_RUNNING" ]; then
    echo -e "${RED}❌ Failed to start PostgreSQL${NC}"
    exit 1
fi

echo -e "${GREEN}✅ PostgreSQL is running (${POSTGRES_RUNNING:0:12})${NC}"

# ============================================================================
# 3. Check/Initialize Database
# ============================================================================
echo ""
echo -e "${YELLOW}3️⃣  Checking database schema...${NC}"

# Check if database exists
DB_EXISTS=$(docker exec "$POSTGRES_RUNNING" psql -U postgres -d postgres -c "SELECT 1 FROM pg_database WHERE datname='e_archiwum_dev'" 2>/dev/null | grep -c "1" || echo "0")

if [ "$DB_EXISTS" = "0" ]; then
    echo -e "${YELLOW}   Database not found. Creating...${NC}"
    docker exec "$POSTGRES_RUNNING" psql -U postgres -d postgres -c "CREATE DATABASE e_archiwum_dev;" > /dev/null 2>&1
    
    # Apply schema
    docker cp "src/main/database/schema.sql" "$POSTGRES_RUNNING:/tmp/schema.sql" > /dev/null 2>&1
    docker exec "$POSTGRES_RUNNING" psql -U postgres -d e_archiwum_dev -f /tmp/schema.sql > /dev/null 2>&1
    echo -e "${GREEN}✅ Database created and schema applied${NC}"
else
    echo -e "${GREEN}✅ Database exists${NC}"
fi

# ============================================================================
# 4. Install Dependencies
# ============================================================================
echo ""
echo -e "${YELLOW}4️⃣  Checking dependencies...${NC}"

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}   Installing npm dependencies...${NC}"
    npm install --silent
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

# ============================================================================
# 5. Start Application
# ============================================================================
echo ""
echo -e "${YELLOW}5️⃣  Starting application...${NC}"
echo ""

# Save PID for later cleanup
echo $$ > "$PROJECT_ROOT/.app-pid"

npm run dev
  docker stop e-archiwum-postgres 2>/dev/null || true
  
  log_info "Cleanup completed"
  
  if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Application stopped normally${NC}"
  else
    echo -e "${RED}Application stopped with exit code: $EXIT_CODE${NC}"
  fi
  
  exit $EXIT_CODE
}

trap cleanup EXIT INT TERM

echo "🚀 e-Archiwum Start"
echo "================================"
echo ""

cd "$PROJECT_ROOT"

# Step 1: Verify prerequisites
echo "Verifying environment..."
command -v docker >/dev/null 2>&1 || { log_error "Docker not installed"; exit 1; }
command -v npm >/dev/null 2>&1 || { log_error "npm not installed"; exit 1; }
log_info "Prerequisites verified"
echo ""

# Step 2: Check/start PostgreSQL
echo "Checking database..."
CONTAINER_NAME="e-archiwum-postgres"

# Check if Docker is available and container exists
if command -v docker >/dev/null 2>&1; then
  CONTAINER_STATE=$(docker ps -a --format '{{.Names}}:{{.State}}' 2>/dev/null | grep "$CONTAINER_NAME" | cut -d: -f2 || echo "not-found")
  
  if [ "$CONTAINER_STATE" = "exited" ]; then
    log_debug "Starting PostgreSQL container..."
    docker start "$CONTAINER_NAME" >/dev/null 2>&1
    sleep 3
  elif [ "$CONTAINER_STATE" = "not-found" ]; then
    log_error "PostgreSQL container not found. Run: ./scripts/setup.sh"
    exit 1
  fi
  
  # Verify PostgreSQL is ready
  RETRY=0
  while [ $RETRY -lt 10 ]; do
    if docker exec "$CONTAINER_NAME" pg_isready -U archiwum -d e_archiwum_dev >/dev/null 2>&1; then
      log_info "Database connection verified (Docker)"
      break
    fi
    RETRY=$((RETRY + 1))
    sleep 1
  done
  
  if [ $RETRY -eq 10 ]; then
    log_error "Database connection failed"
    exit 1
  fi
else
  # Try local PostgreSQL
  if psql -U archiwum -d e_archiwum_dev -c "SELECT 1" >/dev/null 2>&1; then
    log_info "Database connection verified (Local)"
  else
    log_error "Cannot connect to PostgreSQL. Ensure it's running locally or use Docker."
    exit 1
  fi
fi
echo ""

# Step 3: Verify build
echo "Verifying build..."
if [ ! -d "$PROJECT_ROOT/out/main" ]; then
  log_debug "Building Electron application..."
  npm run build >/dev/null 2>&1 || { log_error "Build failed"; exit 1; }
fi
log_info "Build verified"
echo ""

# Step 4: Check ports
echo "Checking ports..."
for PORT in 3000 5173; do
  if lsof -i :$PORT >/dev/null 2>&1; then
    log_warn "Port $PORT is in use, will attempt to proceed"
  fi
done
echo ""

# Step 5: Start application
echo "Starting application..."
echo "  API Server will run on: http://localhost:3000"
echo "  Vite Dev Server will run on: http://localhost:5173"
echo "  Electron window will open automatically"
echo ""
echo "Logs are being written to: $LOGS_DIR/app.log"
echo ""
echo "Press Ctrl+C to stop"
echo "================================"
echo ""

# Start npm dev in background with output to both console and log file
npm run dev 2>&1 | tee -a "$LOGS_DIR/app.log" &
NPM_PID=$!

# Wait for the process
wait $NPM_PID 2>/dev/null || true
