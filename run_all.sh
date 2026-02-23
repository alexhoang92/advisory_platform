#!/bin/bash
# KOL Tracker — Start API server and pipeline scheduler simultaneously

set -e

# Activate virtual environment
source venv/bin/activate

echo "🚀 Starting KOL Tracker..."

# Start the API server in background
uvicorn api:app --host 0.0.0.0 --port 8000 &
API_PID=$!
echo "✅ API server started (PID: $API_PID)  →  http://0.0.0.0:8000"

# Start the pipeline scheduler in background
python3 main.py &
SCHEDULER_PID=$!
echo "✅ Pipeline scheduler started (PID: $SCHEDULER_PID)  →  runs daily at 07:30 ET"

echo ""
echo "📊 Both processes running. Press Ctrl+C to stop."

# Forward Ctrl+C / SIGTERM to both child processes
trap "echo ''; echo '🛑 Shutting down...'; kill $API_PID $SCHEDULER_PID 2>/dev/null; exit" INT TERM

# Keep script alive
wait
