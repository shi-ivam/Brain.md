#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=== Brain.md ==="
echo "Checking GCP Application Default Credentials..."
python3 -c "import google.auth; creds, proj = google.auth.default(); print('ADC OK. GCP Project:', proj)"

echo "Starting FastAPI Backend on http://127.0.0.1:8000 ..."
python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill $BACKEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

echo "Starting Frontend with pnpm on http://localhost:5173 ..."
cd frontend
pnpm dev --host 0.0.0.0 --port 5173
