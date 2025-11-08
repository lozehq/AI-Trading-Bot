/**
 * MCP 自动启动与守护服务
 * - 进程级：直接调用 mcpIntegration.initialize() 确保必要的 MCP 进程就绪
 * - HTTP 级：调用 /api/mcp-control/status 与 /start-all，维持工具处于 active
 */

const axios = require('axios');
const mcpIntegration = require('./mcpIntegration');

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}/api/mcp-control`;

let watchdogTimer = null;

async function httpGetStatus() {
  const resp = await axios.get(`${BASE}/status`, { timeout: 5000 });
  return resp.data && resp.data.data ? resp.data.data : { tools: [], totalTools: 0, runningTools: 0 };
}

async function httpStartAll() {
  await axios.post(`${BASE}/start-all`, {}, { timeout: 5000 });
}

async function checkAndHealOnce() {
  try {
    const s = await httpGetStatus();
    const total = s.totalTools || (Array.isArray(s.tools) ? s.tools.length : 0);
    const running = s.runningTools ?? (Array.isArray(s.tools) ? s.tools.filter(t => t.status === 'running').length : 0);
    if (total === 0 || running < total) {
      console.log(`🛠️  MCP守护：运行 ${running}/${total}，尝试启用全部...`);
      await httpStartAll();
    }
  } catch (e) {
    console.warn(`⚠️  MCP守护检查失败: ${e.message}`);
  }
}

async function ensureAlwaysOn(options = {}) {
  const { startAll = true, intervalMs = 60000 } = options;

  // 1) 直接初始化必要的 MCP 进程（不依赖 HTTP）
  try {
    await mcpIntegration.initialize();
  } catch (e) {
    console.warn(`⚠️  MCP进程初始化失败: ${e.message}`);
  }

  // 2) HTTP 层面标记工具 active，并启动守护循环
  if (startAll) {
    try {
      await httpStartAll();
    } catch (e) {
      // 可能是服务刚启动尚未监听，交给下一轮定时器
      console.warn(`⚠️  MCP初次启用失败（将继续重试）: ${e.message}`);
    }
  }

  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = setInterval(checkAndHealOnce, Math.max(15000, intervalMs));
  console.log(`🔁 MCP守护已启动（间隔 ${Math.max(15000, intervalMs)} ms）`);
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
    console.log('⏹️  MCP守护已停止');
  }
}

module.exports = { ensureAlwaysOn, stopWatchdog };