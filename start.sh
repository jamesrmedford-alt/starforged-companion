#!/bin/bash
# proxy/start.sh — Start the Starforged Companion API proxy
# Run this once before launching Foundry for your session.
# The proxy runs in the background and stops when you close this terminal.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-3001}"

echo "Starting Starforged Companion API Proxy on port $PORT..."
node "$SCRIPT_DIR/claude-proxy.mjs" --port="$PORT" &
PROXY_PID=$!

# Give it a moment to start
sleep 0.5

# Check it came up
if kill -0 $PROXY_PID 2>/dev/null; then
  echo "Proxy running (PID: $PROXY_PID). Launch Foundry now."
  echo "Press Ctrl+C here to stop the proxy when your session is done."
else
  echo "Proxy failed to start. Check the output above."
  exit 1
fi

# Wait and trap Ctrl+C for clean shutdown
trap "echo ''; echo 'Stopping proxy...'; kill $PROXY_PID 2>/dev/null; echo 'Done.'" INT TERM
wait $PROXY_PID
