#!/bin/bash

# One-click, idempotent deploy for Ubuntu: static frontend via Nginx on :80,
# API proxied to 127.0.0.1:3000, WebSocket proxied to 127.0.0.1:3001.
# Robust Vite build (no "vite: Permission denied"), consistent Nginx site name (ai-bot),
# and PM2-managed backend (ai-server). Safe to re-run.

set -euo pipefail

echo "════════════════════════════════════════════════════════"
echo "🚀 One-Click Deploy (Nginx + PM2 + Static Frontend)"
echo "════════════════════════════════════════════════════════"

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT_DIR="$PROJECT_DIR/client"
SERVER_DIR="$PROJECT_DIR/server"
SITE_NAME="ai-bot"
SITE_FILE="/etc/nginx/sites-available/${SITE_NAME}"
SITE_LINK="/etc/nginx/sites-enabled/${SITE_NAME}"

echo "📂 Project: $PROJECT_DIR"
echo "📂 Client : $CLIENT_DIR"
echo "📂 Server : $SERVER_DIR"

# 1) Ensure deps: Node 20+, npm, pm2, nginx
NEED_NODE_UPGRADE=false
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
  if [ "$NODE_MAJOR" -lt 20 ]; then NEED_NODE_UPGRADE=true; fi
else
  NEED_NODE_UPGRADE=true
fi
if [ "$NEED_NODE_UPGRADE" = true ]; then
  echo "📦 Installing/Upgrading Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  echo "✅ Node: $(node -v)"
fi
if ! command -v pm2 >/dev/null 2>&1; then
  echo "📦 Installing pm2..."
  sudo npm install -g pm2
fi
if ! command -v nginx >/dev/null 2>&1; then
  echo "📦 Installing Nginx..."
  sudo apt-get update
  sudo apt-get install -y nginx
fi

# 2) Install project deps (root not required; server/client are needed)
echo "📦 Installing project dependencies (server/client)..."
if [ -d "$SERVER_DIR" ]; then
  cd "$SERVER_DIR"
  rm -rf node_modules package-lock.json
  npm cache clean --force || true
  npm install
  echo "   → Rebuilding better-sqlite3 (build-from-source)"
  npm rebuild better-sqlite3 --build-from-source >/dev/null 2>&1 || npm i better-sqlite3@latest --build-from-source >/dev/null 2>&1 || true
fi
if [ -d "$CLIENT_DIR" ]; then
  cd "$CLIENT_DIR"
  rm -rf node_modules package-lock.json
  npm cache clean --force || true
  npm install
fi

# 3) Build frontend robustly (handle "vite: Permission denied")
echo "🏗️  Building frontend..."
cd "$CLIENT_DIR"
set +e
npm run build
BUILD_RC=$?
set -e
if [ $BUILD_RC -ne 0 ]; then
  echo "⚠️  npm run build failed; fixing Vite permissions and retrying..."
  chmod +x node_modules/.bin/vite node_modules/vite/bin/vite.js 2>/dev/null || true
  if command -v npx >/dev/null 2>&1; then
    npx vite build || node ./node_modules/vite/bin/vite.js build || true
  else
    node ./node_modules/vite/bin/vite.js build || true
  fi
fi
if [ ! -f "dist/index.html" ]; then
  echo "🔁 Cleaning cache and reinstalling client deps due to Rollup optional dep issue..."
  rm -rf node_modules package-lock.json
  npm cache clean --force || true
  npm install
  npm run build
fi
echo "✅ Frontend build complete"

# 4) Start/Restart backend with PM2
echo "🚀 Starting backend (PM2: ai-server)..."
cd "$SERVER_DIR"
pm2 delete ai-server >/dev/null 2>&1 || true
SERVER_IP=$(hostname -I | awk '{print $1}')
touch .env
set_kv() {
  local key="$1"; shift
  local val="$1"; shift
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}
set_kv PORT 3000
set_kv WS_PORT 3001
set_kv ALLOWED_ORIGINS "http://localhost:5173,http://localhost:3000,http://127.0.0.1,http://$SERVER_IP"
pm2 start index.js --name ai-server --env production \
  --time --max-memory-restart 1G \
  --log "$PROJECT_DIR/logs/server.log" --error "$PROJECT_DIR/logs/server-error.log"

# 5) Nginx site (serve static dist, proxy /api and /ws)
echo "🔧 Configuring Nginx site: $SITE_NAME"
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
sudo tee "$SITE_FILE" >/dev/null <<NGX
server {
    listen 80;
    server_name _;

    access_log /var/log/nginx/${SITE_NAME}-access.log;
    error_log  /var/log/nginx/${SITE_NAME}-error.log;

    # Static frontend built by Vite
    root ${CLIENT_DIR}/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Health check passthrough
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
NGX

sudo ln -sf "$SITE_FILE" "$SITE_LINK"
sudo rm -f /etc/nginx/sites-enabled/default || true
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx >/dev/null 2>&1 || true

# 6) Remove any obsolete frontend PM2 server (we serve via Nginx now)
pm2 delete ai-web >/dev/null 2>&1 || true

# 7) Persist PM2
pm2 save
# Optional (prints command to enable startup):
sudo env PATH=$PATH pm2 startup systemd -u $(whoami) --hp $HOME >/dev/null 2>&1 || true

echo ""
echo "✅ Deploy finished. Health checks (expect HTTP/200, not 502):"
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "   Frontend:   http://$SERVER_IP/"
echo "   API:        curl -i http://127.0.0.1:3000/health"
echo "   Nginx->API: curl -i http://127.0.0.1/api/ai/status"
echo ""
echo "If cache persists in browser, open DevTools → Network (Disable cache) → Ctrl+F5"


