#!/bin/bash
# Double-click this file in Finder (or run ./start.command) to launch the app.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  # Finder-launched shells may not load nvm; try it.
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install it from https://nodejs.org and try again."
  read -r -p "Press Enter to close."
  exit 1
fi
exec node server.js --open
