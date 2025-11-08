@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ======================================================
:: AI Trading Bot - 一键启动 (Windows)
:: - 自动检测 Node 与依赖
:: - 首次启动自动安装依赖（根目录 + client）
:: - 并行启动后端与前端（npm run dev）
:: ======================================================

cd /d "%~dp0"
echo.
echo ════════════════════════════════════════════════════════
echo 🤖 AI Trading Bot - 一键启动 (Windows)
echo ════════════════════════════════════════════════════════
echo 当前目录: %cd%
echo.

:: 1) 检查 Node.js
echo [1/4] 检查 Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo ⚠️ 未检测到 Node.js，请先安装 Node.js 18/20 以上版本: https://nodejs.org
  pause
  exit /b 1
) else (
  for /f "tokens=2 delims=v" %%v in ('node -v') do set NODE_VER=%%v
  echo ✅ 已检测到 Node.js v!NODE_VER!
)

:: 2) 准备 .env（若不存在则从示例复制）
echo [2/4] 检查 .env...
if not exist .env (
  if exist env.example (
    copy /y env.example .env >nul
    echo ✅ 已从 env.example 生成 .env（请按需修改）
  ) else (
    echo ⚠️ 未找到 env 模板，请手动创建 .env （可参考 README/SETUP）
  )
) else (
  echo ✅ 已存在 .env
)

:: 3) 安装依赖（仅在缺失时）
echo [3/4] 检查依赖安装...
set NEED_INSTALL=0
if not exist node_modules set NEED_INSTALL=1
if not exist client\node_modules set NEED_INSTALL=1

if !NEED_INSTALL! EQU 1 (
  echo ⏳ 正在安装依赖（根目录 + client）...
  call npm run install-all
  if errorlevel 1 (
    echo ❌ 依赖安装失败，请检查网络或重试
    pause
    exit /b 1
  )
  echo ✅ 依赖安装完成
) else (
  echo ✅ 依赖已就绪（跳过安装）
)

:: 4) 启动服务（并行：后端 + 前端）
echo [4/4] 启动服务...
set "BROWSER=none"
call npm run dev
if errorlevel 1 (
  echo ❌ 启动失败，请查看上方错误日志
  pause
  exit /b 1
)

echo.
echo ✅ 启动命令已执行（dev 模式：后端3000 / 前端5173 / WS 3001）
echo 若未自动打开浏览器，请访问: http://localhost:5173
echo.

endlocal
exit /b 0

