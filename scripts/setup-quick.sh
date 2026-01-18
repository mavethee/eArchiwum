#!/bin/bash

# e-Archiwum Quick Setup (without Docker)
# For development when Docker is not available

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔧 e-Archiwum Quick Setup (No Docker)"
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
log_info "Node.js and npm available"
echo ""

# Check PostgreSQL
echo "Checking PostgreSQL..."
if ! command -v psql >/dev/null 2>&1; then
  log_error "PostgreSQL psql not found"
  echo ""
  echo "Install PostgreSQL:"
  echo "  macOS: brew install postgresql@15"
  echo "  Linux (Ubuntu): sudo apt-get install postgresql postgresql-contrib"
  echo "  Windows: Download from https://www.postgresql.org/download/"
  exit 1
fi
log_info "PostgreSQL CLI available"
echo ""

# Check if PostgreSQL is running
echo "Checking PostgreSQL server..."
if ! psql -c "SELECT 1" >/dev/null 2>&1; then
  log_error "PostgreSQL server not running"
  echo ""
  echo "Start PostgreSQL:"
  echo "  macOS: brew services start postgresql@15"
  echo "  Linux: sudo systemctl start postgresql"
  echo "  Windows: Start 'PostgreSQL' service from Services"
  exit 1
fi
log_info "PostgreSQL server is running"
echo ""

# Create database and user
echo "Setting up database..."
DBUSER="archiwum"
DBPASS="archiwum_dev"
DBNAME="e_archiwum_dev"

# Check if user exists
if psql -lqt | cut -d\| -f 1 | grep -qw "$DBUSER"; then
  log_warn "User '$DBUSER' already exists"
else
  # Create user - try to connect as current user or postgres
  if psql -c "CREATE USER $DBUSER WITH PASSWORD '$DBPASS';" 2>/dev/null; then
    log_info "Created PostgreSQL user"
  else
    log_warn "Could not create user (may already exist)"
  fi
fi

# Check if database exists
if psql -lqt | cut -d\| -f 1 | grep -qw "$DBNAME"; then
  log_warn "Database '$DBNAME' already exists"
  
  read -p "Drop and recreate database? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    psql -c "DROP DATABASE IF EXISTS $DBNAME;" 2>/dev/null || true
  else
    log_info "Using existing database"
  fi
fi

# Create database if not exists
if ! psql -lqt | cut -d\| -f 1 | grep -qw "$DBNAME"; then
  if psql -c "CREATE DATABASE $DBNAME OWNER $DBUSER;" 2>/dev/null; then
    log_info "Created database '$DBNAME'"
  else
    log_error "Failed to create database"
    exit 1
  fi
fi

# Grant privileges
psql -c "GRANT ALL PRIVILEGES ON DATABASE $DBNAME TO $DBUSER;" 2>/dev/null || true
log_info "Configured database privileges"

# Run schema
echo "Initializing schema..."
if psql -U "$DBUSER" -d "$DBNAME" -f "$PROJECT_ROOT/src/main/database/schema.sql" >/dev/null 2>&1; then
  log_info "Schema initialized successfully"
else
  log_warn "Schema initialization had warnings (may be expected)"
fi
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

# Build Electron
echo "Building Electron application..."
npm run build >/dev/null 2>&1 || { log_error "Electron build failed"; exit 1; }
log_info "Electron build successful"
echo ""

# Create .env file
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
  log_info "Created .env file (from .env.example)"
else
  log_warn ".env file already exists"
fi
echo ""

echo "================================"
echo -e "${GREEN}✓ Quick setup completed!${NC}"
echo ""
echo "PostgreSQL configuration:"
echo "  User: $DBUSER"
echo "  Password: $DBPASS"
echo "  Database: $DBNAME"
echo "  Host: localhost:5432"
echo ""
echo "Next steps:"
echo "  1. Start the application: ./scripts/start.sh"
echo "  2. View logs: tail -f logs/app.log"
echo ""
