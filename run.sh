#!/usr/bin/env bash
# ==============================================================================
# Brain.md - Unified Application Launcher
# Starts both FastAPI Backend (port 8000) and Vite Frontend (port 5173).
# Handles dependencies, port cleanup, health check, and graceful shutdown on Ctrl+C.
# ==============================================================================

set -uo pipefail

PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$PROJECT_ROOT"

BACKEND_HOST="127.0.0.1"
BACKEND_PORT=8000
FRONTEND_PORT=5173

# Colors for terminal formatting
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}             Knowledge Graph & Study Engine         ${NC}"
echo -e "${CYAN}====================================================${NC}"

# Check Python 3
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}[Error] python3 could not be found. Please install Python 3.10+.${NC}"
    exit 1
fi

# Auto-activate virtualenv if present
if [ -d "$PROJECT_ROOT/.venv" ]; then
    source "$PROJECT_ROOT/.venv/bin/activate"
elif [ -d "$PROJECT_ROOT/venv" ]; then
    source "$PROJECT_ROOT/venv/bin/activate"
fi

# Check Node / Package Manager
if command -v pnpm &> /dev/null; then
    PACKAGE_MGR="pnpm"
elif command -v npm &> /dev/null; then
    PACKAGE_MGR="npm"
else
    echo -e "${RED}[Error] Neither pnpm nor npm was found. Please install Node.js & pnpm.${NC}"
    exit 1
fi

# Verify Python dependencies
if ! python3 -c "import fastapi, uvicorn, sqlite3" &> /dev/null; then
    echo -e "${YELLOW}[Notice] Required Python packages not found. Installing from backend/requirements.txt...${NC}"
    python3 -m pip install -r backend/requirements.txt
fi

# Check frontend dependencies
if [ ! -d "$PROJECT_ROOT/frontend/node_modules" ]; then
    echo -e "${YELLOW}[Notice] Frontend dependencies not found. Running ${PACKAGE_MGR} install...${NC}"
    (cd "$PROJECT_ROOT/frontend" && $PACKAGE_MGR install)
fi

# Release busy ports if stale instances exist
kill_port_if_in_use() {
    local port=$1
    local pid
    pid=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo -e "${YELLOW}[Notice] Port $port is in use by PID $pid. Releasing...${NC}"
        kill -9 "$pid" 2>/dev/null || true
        sleep 1
    fi
}

kill_port_if_in_use $BACKEND_PORT
kill_port_if_in_use $FRONTEND_PORT

# Non-blocking AI credential check
echo -e "${BLUE}[1/3] Checking environment configuration...${NC}"
if python3 -c "import google.auth; creds, proj = google.auth.default(); print('Project:', proj)" &> /dev/null; then
    echo -e "      ${GREEN}✓ AI service credentials active${NC}"
elif [ -n "${GEMINI_API_KEY:-}" ]; then
    echo -e "      ${GREEN}✓ GEMINI_API_KEY configured${NC}"
else
    echo -e "      ${YELLOW}! Note: AI credentials not detected. Graph canvas and notes work normally, AI synthesis will require login/key.${NC}"
fi

# Cleanup handler for graceful termination
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down application services...${NC}"
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    echo -e "${GREEN}All services stopped cleanly.${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Start FastAPI Backend
echo -e "${BLUE}[2/3] Starting FastAPI Backend on http://${BACKEND_HOST}:${BACKEND_PORT} ...${NC}"
python3 -m uvicorn backend.app.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" --reload &
BACKEND_PID=$!

# Wait for backend health endpoint to respond
echo -e "      Waiting for backend to be ready..."
max_retries=30
count=0
backend_ready=false

while [ $count -lt $max_retries ]; do
    if curl -s -f "http://${BACKEND_HOST}:${BACKEND_PORT}/docs" > /dev/null 2>&1; then
        backend_ready=true
        break
    fi
    sleep 0.5
    count=$((count + 1))
done

if [ "$backend_ready" = true ]; then
    echo -e "      ${GREEN}✓ Backend is healthy and ready!${NC}"
else
    echo -e "      ${YELLOW}! Backend took longer than expected to report ready, proceeding...${NC}"
fi

# Start Vite Frontend
echo -e "${BLUE}[3/3] Starting Frontend (${PACKAGE_MGR} dev) on http://localhost:${FRONTEND_PORT} ...${NC}"
echo ""
echo -e "${GREEN}====================================================${NC}"
echo -e "  ${GREEN}Application URL:${NC} http://localhost:${FRONTEND_PORT}"
echo -e "  ${GREEN}Backend API:${NC}     http://${BACKEND_HOST}:${BACKEND_PORT}"
echo -e "  ${GREEN}API Documentation:${NC} http://${BACKEND_HOST}:${BACKEND_PORT}/docs"
echo -e "  Press ${CYAN}Ctrl+C${NC} to stop both services."
echo -e "${GREEN}====================================================${NC}"
echo ""

cd "$PROJECT_ROOT/frontend"
$PACKAGE_MGR dev --port $FRONTEND_PORT &
FRONTEND_PID=$!

# Keep script running and wait for child processes
wait "$FRONTEND_PID"
