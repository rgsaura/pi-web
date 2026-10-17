#!/bin/bash
PORT=30147
echo "Starting test server on port $PORT..."
exec /usr/local/bin/node bin/pi-web.js --hostname 0.0.0.0 --port $PORT --no-open
