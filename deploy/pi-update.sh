#!/usr/bin/env bash
# Pull the latest macro tracker from GitHub, build it, and restart it on the Pi.
# First time:  bash deploy/pi-update.sh --install
#
# .env.local (never committed) points the Pi build at MacroTacker and signs in by itself:
#   VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PROJECT_ID
#   VITE_AUTO_LOGIN_EMAIL / VITE_AUTO_LOGIN_PASSWORD
#   MACRO_DB_URL   (database connection string, for migrations)
# Missing ones are copied from Lingo's .env.local (~/yaai-lingo), which has all of them.
set -euo pipefail
cd "$(dirname "$0")/.."

node_major=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)
if [ "${node_major:-0}" -lt 18 ]; then
  echo "Node $(node -v 2>/dev/null || echo 'missing') is too old, need 18+."
  exit 1
fi

# MacroTacker (the project YAAI, Lingo and the agenda use; the committed .env still names the old one from before
# the move), the Pi's login and the database address: copied from Lingo's .env.local, each only if missing
lingo=~/yaai-lingo/.env.local
add_from_lingo() {   # add_from_lingo NAME [NAME_IN_LINGO]
  if ! grep -q "^$1=" .env.local 2>/dev/null && grep -q "^${2:-$1}=" "$lingo" 2>/dev/null; then
    grep -E "^${2:-$1}=" "$lingo" | head -n1 | sed "s/^${2:-$1}=/$1=/" >> .env.local
    echo "    added $1 from Lingo's settings"
  fi
}
if [ -f "$lingo" ]; then
  touch .env.local && chmod 600 .env.local
  for v in VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_SUPABASE_PROJECT_ID VITE_AUTO_LOGIN_EMAIL VITE_AUTO_LOGIN_PASSWORD; do
    add_from_lingo "$v"
  done
  add_from_lingo MACRO_DB_URL LINGO_DB_URL
else
  echo "No Lingo .env.local found: add MacroTacker's settings to .env.local by hand (see the top of this script)."
fi

echo "==> Pulling latest version"
git pull --ff-only

echo "==> Database"
bash deploy/apply-migrations.sh

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
