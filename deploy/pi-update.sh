#!/usr/bin/env bash
# Pull the latest macro tracker from GitHub, build it, and restart it on the Pi.
# First time:  bash deploy/pi-update.sh --install
#
# The Supabase project comes from .env (committed). .env.local (never committed) adds the Pi's auto-login:
#   VITE_AUTO_LOGIN_EMAIL / VITE_AUTO_LOGIN_PASSWORD
# On the first run they are copied from Lingo's .env.local (~/yaai-lingo).
set -euo pipefail
cd "$(dirname "$0")/.."

node_major=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)
if [ "${node_major:-0}" -lt 18 ]; then
  echo "Node $(node -v 2>/dev/null || echo 'missing') is too old, need 18+."
  exit 1
fi

if ! grep -q '^VITE_AUTO_LOGIN_EMAIL=' .env.local 2>/dev/null; then
  lingo=~/yaai-lingo/.env.local
  if [ -f "$lingo" ]; then
    echo "==> Copying the Pi's login from Lingo's .env.local"
    grep -E '^VITE_AUTO_LOGIN_(EMAIL|PASSWORD)=' "$lingo" >> .env.local
    chmod 600 .env.local
    # the macro tracker's own Supabase project vs Lingo's: the login only works if it's the same project
    mine=$(grep -E '^VITE_SUPABASE_PROJECT_ID=' .env | cut -d= -f2- | tr -d "\"'")
    theirs=$(grep -E '^VITE_SUPABASE_PROJECT_ID=' "$lingo" | cut -d= -f2- | tr -d "\"'")
    if [ -n "$theirs" ] && [ "$mine" != "$theirs" ]; then
      echo "Note: the macro tracker uses a different Supabase project than Lingo; you may see its login page once."
    fi
  else
    echo "No Lingo .env.local found: the app will show its login page."
  fi
fi

echo "==> Pulling latest version"
git pull --ff-only

echo "==> Installing dependencies (first run takes a few minutes)"
npm install --no-audit --no-fund
echo "==> Building"
npx vite build
git checkout -- package-lock.json 2>/dev/null || true

if [ "${1:-}" = "--install" ]; then
  echo "==> Installing the service"
  sudo cp deploy/yaai-macro.service /etc/systemd/system/yaai-macro.service
  sudo systemctl daemon-reload
  sudo systemctl enable yaai-macro
fi

echo "==> Restarting"
sudo systemctl restart yaai-macro
sleep 2
if systemctl is-active --quiet yaai-macro; then
  echo "Running: http://$(tailscale ip -4 | head -n1):5007"
else
  echo "Service didn't start. Details: journalctl -u yaai-macro -n 30"
  exit 1
fi
