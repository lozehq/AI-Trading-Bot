#!/bin/bash
# 修复并重新构建前端

echo "🔧 修复前端数据安全问题并重新构建..."

cd "$(dirname "$0")"

# 清理旧的构建文件
echo "🗑️  清理旧构建..."
rm -rf dist

# 重新构建
echo "📦 重新构建前端..."
npm run build
BUILD_RC=$?
if [ $BUILD_RC -ne 0 ]; then
  echo "⚠️  npm run build 失败，尝试修复 Vite 可执行权限并回退为直接调用"
  chmod +x node_modules/.bin/vite node_modules/vite/bin/vite.js 2>/dev/null || true
  # 优先使用 npx，其次直接用 node 执行 vite.js
  if command -v npx >/dev/null 2>&1; then
    npx vite build || node ./node_modules/vite/bin/vite.js build
  else
    node ./node_modules/vite/bin/vite.js build
  fi
fi

echo "✅ 构建完成！"
echo ""
echo "如果项目已经在运行，请执行以下命令重启前端："
echo "  pm2 restart ai-web"

