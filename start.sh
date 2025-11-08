#!/bin/bash

# AI Trading Bot - 一键启动脚本
# 适用于 Ubuntu/Debian 系统
# 统一端口：80 (通过 Nginx 反向代理)

set -e  # 遇到错误立即退出

echo "════════════════════════════════════════════════════════"
echo "🤖 AI Trading Bot - 一键启动脚本（统一端口版）"
echo "════════════════════════════════════════════════════════"
echo ""

# 检测系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    echo "✅ 检测到系统: $PRETTY_NAME"
else
    echo "⚠️  无法检测系统类型，假设为 Ubuntu/Debian"
    OS="ubuntu"
fi

# 获取项目根目录
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "📂 项目目录: $PROJECT_DIR"
echo ""

# 1. 检查并安装/升级 Node.js (≥20)
echo "📦 检查 Node.js..."
NEED_NODE_UPGRADE=false
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
    if [ "$NODE_MAJOR" -lt 20 ]; then
        NEED_NODE_UPGRADE=true
    else
    echo "✅ Node.js 已安装: $NODE_VERSION"
    fi
else
    NEED_NODE_UPGRADE=true
fi
if [ "$NEED_NODE_UPGRADE" = true ]; then
    echo "⚠️  安装/升级 Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "✅ Node.js 版本: $(node -v)"
fi

# 2. 检查并安装 pm2
echo ""
echo "📦 检查 pm2..."
if ! command -v pm2 &> /dev/null; then
    echo "⚠️  pm2 未安装，开始安装..."
    sudo npm install -g pm2
    echo "✅ pm2 安装完成"
else
    echo "✅ pm2 已安装"
fi

# 3. 检查并安装 Nginx
echo ""
echo "📦 检查 Nginx..."
if ! command -v nginx &> /dev/null; then
    echo "⚠️  Nginx 未安装，开始安装..."
    sudo apt-get update
    sudo apt-get install -y nginx
    echo "✅ Nginx 安装完成"
else
    echo "✅ Nginx 已安装"
fi

# 4. 安装项目依赖
echo ""
echo "📦 检查并安装项目依赖..."

# 根目录依赖
cd "$PROJECT_DIR"
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
    echo "   → 安装根目录依赖..."
    npm install
else
    echo "   ✓ 根目录依赖已安装，跳过"
fi

# 后端依赖
cd "$PROJECT_DIR/server"
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
    echo "   → 安装后端依赖..."
    npm install
else
    echo "   ✓ 后端依赖已安装，跳过"
fi

# 强制重建 better-sqlite3 以避免 ELF/ABI 不匹配
echo "   → 重建 better-sqlite3 (build-from-source)"
npm rebuild better-sqlite3 --build-from-source >/dev/null 2>&1 || npm i better-sqlite3@latest --build-from-source >/dev/null 2>&1 || true

# 前端依赖
cd "$PROJECT_DIR/client"
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
    echo "   → 安装前端依赖..."
    npm install
else
    echo "   ✓ 前端依赖已安装，跳过"
fi

echo "✅ 依赖检查完成"

# 4. 安装构建工具（用于编译原生依赖，如 better-sqlite3）
echo ""
echo "🧰 安装构建工具 (build-essential, python3, libsqlite3-dev)..."
sudo apt-get update -y >/dev/null 2>&1 || true
sudo apt-get install -y build-essential python3 make g++ libsqlite3-dev >/dev/null 2>&1 || true

# 5. 创建日志目录
mkdir -p "$PROJECT_DIR/logs"

# 6. 停止旧进程
echo ""
echo "🛑 检查并停止旧进程..."
if pm2 list | grep -q "ai-server"; then
    echo "   → 停止旧后端进程..."
    pm2 delete ai-server
else
    echo "   ✓ 无旧后端进程"
fi

if pm2 list | grep -q "ai-web"; then
    echo "   → 停止旧前端进程..."
    pm2 delete ai-web
else
    echo "   ✓ 无旧前端进程"
fi

# 7. 启动后端
echo ""
echo "🚀 启动后端服务..."
cd "$PROJECT_DIR/server"

# 写入标准端口，统一与 Nginx 配置（不覆盖已有敏感键）
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

pm2 start index.js --name ai-server \
  --log "$PROJECT_DIR/logs/server.log" \
  --error "$PROJECT_DIR/logs/server-error.log" \
  --env production

echo "✅ 后端启动成功（内部端口 3000, 3001）"

# 8. 构建前端（静态托管）
echo ""
echo "🚀 检查前端构建..."
cd "$PROJECT_DIR/client"

# 检查是否需要重新构建（对比 package.json 时间戳）
NEEDS_BUILD=false
if [ ! -d "dist" ]; then
    NEEDS_BUILD=true
    echo "   → 首次构建前端..."
elif [ "package.json" -nt "dist" ]; then
    NEEDS_BUILD=true
    echo "   → 检测到依赖变化，重新构建..."
else
    echo "   ✓ 前端已构建且无变化，跳过构建"
fi

if [ "$NEEDS_BUILD" = true ]; then
    set +e
    npm run build
    BUILD_RC=$?
    set -e
    if [ $BUILD_RC -ne 0 ]; then
        echo "⚠️  构建失败，修复 Vite 权限并回退执行..."
        chmod +x node_modules/.bin/vite node_modules/vite/bin/vite.js 2>/dev/null || true
        if command -v npx >/dev/null 2>&1; then
            npx vite build || node ./node_modules/vite/bin/vite.js build || true
        else
            node ./node_modules/vite/bin/vite.js build || true
        fi
    fi
    # 若仍失败，强制清理并重装依赖后再次构建
    if [ ! -f "dist/index.html" ]; then
        echo "🔁 清理缓存并重新安装依赖后构建..."
        rm -rf node_modules package-lock.json
        npm cache clean --force || true
        npm install
        npm run build
    fi
    echo "   ✅ 构建完成"
fi

# 不再启动 5173，统一由 Nginx 静态托管 dist
pm2 delete ai-web 2>/dev/null || true

# 9. 配置 Nginx（静态托管 + 反向代理 /api 和 /ws）
echo ""
echo "🔧 配置 Nginx..."

# 清理旧站点链接，启用 ai-bot
sudo rm -f /etc/nginx/sites-enabled/ai-trading-bot /etc/nginx/sites-enabled/ai-trading 2>/dev/null || true
sudo cp "$PROJECT_DIR/nginx.conf" /etc/nginx/sites-available/ai-bot
sudo ln -sf /etc/nginx/sites-available/ai-bot /etc/nginx/sites-enabled/ai-bot
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# 确保目录权限便于 Nginx 读取
sudo chmod 755 /home/ubuntu /home/ubuntu/合约 /home/ubuntu/合约/client /home/ubuntu/合约/client/dist 2>/dev/null || true

# 测试配置
echo "   → 测试 Nginx 配置..."
if sudo nginx -t 2>/dev/null; then
    echo "   ✓ Nginx 配置有效"
else
    echo "   ✗ Nginx 配置错误，请检查"
    exit 1
fi

# 重启 Nginx
echo "   → 重启 Nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "✅ Nginx 配置完成"

# 10. 保存 pm2 配置
echo ""
echo "💾 保存 pm2 配置..."
pm2 save

# 11. 显示状态
echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ 启动完成！"
echo "════════════════════════════════════════════════════════"
echo ""
pm2 status
echo ""
echo "📊 访问地址（统一端口 80）："
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "   🌐 主页面:    http://$SERVER_IP"
echo "   🔌 后端 API:  http://$SERVER_IP/api"
echo "   💬 WebSocket: ws://$SERVER_IP/ws"
echo ""
echo "   💡 提示：所有服务已通过 Nginx 统一到 80 端口"
echo "   💡 如无法访问，请确保防火墙开放了 80 端口"
echo ""
echo "📝 日志位置："
echo "   后端日志:  $PROJECT_DIR/logs/server.log"
echo "   前端日志:  (由 Nginx 静态托管)"
echo "   Nginx日志: /var/log/nginx/ai-bot-*.log"
echo ""
echo "📋 常用命令："
echo "   查看状态:     pm2 status"
echo "   查看日志:     pm2 logs"
echo "   重启应用:     pm2 restart all"
echo "   停止应用:     pm2 stop all"
echo "   重启 Nginx:   sudo systemctl restart nginx"
echo "   查看 Nginx:   sudo systemctl status nginx"
echo "   开机自启:     sudo pm2 startup && pm2 save"
echo ""
echo "🔧 防火墙配置（如需要）："
echo "   sudo ufw allow 80/tcp"
echo "   sudo ufw status"
echo ""
echo "════════════════════════════════════════════════════════"

