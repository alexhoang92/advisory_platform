#!/bin/bash
# KOL Tracker — Start pipeline scheduler

set -e

echo "🚀 Starting KOL Tracker pipeline scheduler..."

# Start the pipeline scheduler
python3 main.py &
SCHEDULER_PID=$!
echo "✅ Pipeline scheduler started (PID: $SCHEDULER_PID)  →  runs daily at 07:30 ET"

echo ""
echo "📊 Scheduler running. Press Ctrl+C to stop."

# Forward Ctrl+C / SIGTERM to child process
trap "echo ''; echo '🛑 Shutting down...'; kill $SCHEDULER_PID 2>/dev/null; exit" INT TERM

# Keep script alive
wait
