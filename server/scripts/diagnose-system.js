/**
 * 系统全面诊断脚本
 * 检查：AI分析、数据获取、自动循环
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_SYMBOL = 'ETH/USDT';
const TEST_EXCHANGE = 'okx';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 测试结果统计
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0
};

async function test(name, fn) {
  results.total++;
  try {
    const result = await fn();
    if (result === false) {
      results.warnings++;
      log(`⚠️  ${name}`, 'yellow');
      return false;
    } else {
      results.passed++;
      log(`✅ ${name}`, 'green');
      return true;
    }
  } catch (error) {
    results.failed++;
    log(`❌ ${name}`, 'red');
    log(`   错误: ${error.message}`, 'red');
    return false;
  }
}

// ========================================
// 1. 基础健康检查
// ========================================
async function checkHealth() {
  section('第1步: 基础健康检查');

  await test('服务器响应', async () => {
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    log(`   状态: ${response.data.status}`, 'blue');
    return response.status === 200;
  });

  await test('数据库连接', async () => {
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    if (!response.data.database) {
      throw new Error('数据库状态未知');
    }
    log(`   数据库: ${response.data.database}`, 'blue');
    return true;
  });
}

// ========================================
// 2. 数据获取功能测试
// ========================================
async function checkDataFetching() {
  section('第2步: 数据获取功能测试');

  await test('获取实时价格', async () => {
    const response = await axios.get(`${BASE_URL}/api/market/ticker`, {
      params: { symbol: TEST_SYMBOL, exchange: TEST_EXCHANGE },
      timeout: 10000
    });

    if (!response.data.success) {
      throw new Error('获取价格失败');
    }

    const price = response.data.data.last;
    log(`   ETH/USDT 当前价格: $${price}`, 'blue');

    if (!price || price <= 0) {
      throw new Error('价格数据无效');
    }

    return true;
  });

  await test('获取技术指标', async () => {
    const response = await axios.get(`${BASE_URL}/api/indicators/all`, {
      params: {
        symbol: TEST_SYMBOL,
        exchange: TEST_EXCHANGE,
        timeframe: '1h'
      },
      timeout: 15000
    });

    if (!response.data.success) {
      throw new Error('获取指标失败');
    }

    const indicators = response.data.data;
    const indicatorCount = Object.keys(indicators).length;
    log(`   技术指标数量: ${indicatorCount}`, 'blue');

    // 检查关键指标
    const requiredIndicators = ['rsi', 'macd', 'ema', 'sma'];
    const missing = requiredIndicators.filter(ind => !indicators[ind]);

    if (missing.length > 0) {
      log(`   ⚠️  缺失指标: ${missing.join(', ')}`, 'yellow');
      return false;
    }

    log(`   ✓ RSI: ${indicators.rsi?.rsi_14?.toFixed(2)}`, 'blue');
    log(`   ✓ EMA(9): ${indicators.ema?.ema_9?.toFixed(2)}`, 'blue');

    return true;
  });

  await test('获取K线数据', async () => {
    const response = await axios.get(`${BASE_URL}/api/market/ohlcv`, {
      params: {
        symbol: TEST_SYMBOL,
        exchange: TEST_EXCHANGE,
        timeframe: '1h',
        limit: 10
      },
      timeout: 10000
    });

    if (!response.data.success) {
      throw new Error('获取K线失败');
    }

    const klines = response.data.data;
    log(`   K线数量: ${klines.length}`, 'blue');

    if (klines.length < 5) {
      throw new Error('K线数据不足');
    }

    const latest = klines[klines.length - 1];
    log(`   最新K线: O=${latest[1]} H=${latest[2]} L=${latest[3]} C=${latest[4]}`, 'blue');

    return true;
  });
}

// ========================================
// 3. AI分析功能测试
// ========================================
async function checkAIAnalysis() {
  section('第3步: AI分析功能测试');

  log('⏳ 正在执行AI分析（预计30-60秒）...', 'yellow');

  await test('AI深度分析', async () => {
    const startTime = Date.now();

    const response = await axios.post(`${BASE_URL}/api/ai/analyze-with-tools`, {
      symbol: TEST_SYMBOL,
      mode: 'complete',
      useFullMCP: true,
      forceRefresh: false
    }, {
      timeout: 120000 // 120秒超时
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!response.data.success) {
      throw new Error('AI分析失败');
    }

    const analysis = response.data.data;

    log(`   ⏱️  分析耗时: ${duration}秒`, 'blue');
    log(`   📊 分析摘要: ${analysis.summary?.substring(0, 80)}...`, 'blue');
    log(`   💡 信号: ${analysis.decision?.signal}`, 'blue');
    log(`   📈 置信度: ${analysis.decision?.confidence}%`, 'blue');
    log(`   ⚠️  风险等级: ${analysis.decision?.riskLevel}`, 'blue');

    // 验证关键字段
    if (!analysis.summary || !analysis.chainOfThought || !analysis.decision) {
      throw new Error('分析结果缺少关键字段');
    }

    if (!analysis.decision.signal || !['BUY', 'SELL', 'HOLD'].includes(analysis.decision.signal)) {
      throw new Error('无效的交易信号');
    }

    if (typeof analysis.decision.confidence !== 'number' ||
        analysis.decision.confidence < 0 ||
        analysis.decision.confidence > 100) {
      throw new Error('无效的置信度');
    }

    // 检查是否使用了技术指标
    if (analysis.usedIndicators && analysis.usedIndicators.length > 0) {
      log(`   📐 使用指标: ${analysis.usedIndicators.join(', ')}`, 'blue');
    }

    // 检查预警建议
    if (analysis.alertSuggestions && analysis.alertSuggestions.length > 0) {
      log(`   🔔 预警建议: ${analysis.alertSuggestions.length}个`, 'blue');
    }

    return true;
  });
}

// ========================================
// 4. 历史记录检查
// ========================================
async function checkHistory() {
  section('第4步: 历史记录检查');

  await test('查询分析历史', async () => {
    const response = await axios.get(`${BASE_URL}/api/ai/analysis-history`, {
      params: {
        symbol: TEST_SYMBOL,
        limit: 5
      },
      timeout: 5000
    });

    if (!response.data.success) {
      throw new Error('查询历史失败');
    }

    const history = response.data.data;
    log(`   历史记录数量: ${history.length}`, 'blue');

    if (history.length > 0) {
      const latest = history[0];
      log(`   最新分析时间: ${latest.created_at}`, 'blue');
      log(`   最新信号: ${latest.signal} (${latest.confidence}%)`, 'blue');
    }

    return true;
  });
}

// ========================================
// 5. 性能监控检查
// ========================================
async function checkPerformance() {
  section('第5步: 性能监控检查');

  await test('性能监控摘要', async () => {
    const response = await axios.get(`${BASE_URL}/api/performance/summary`, {
      timeout: 5000
    });

    if (!response.data.success) {
      throw new Error('获取性能数据失败');
    }

    const perf = response.data.data;

    log(`   API调用总数: ${perf.apiCalls?.total || 0}`, 'blue');
    log(`   平均响应时间: ${perf.apiCalls?.avgResponseTime || 0}ms`, 'blue');
    log(`   缓存命中率: ${perf.cache?.hitRate || '0%'}`, 'blue');
    log(`   并发控制: ${perf.concurrency?.currentActive || 0}/${perf.concurrency?.maxActive || 0}`, 'blue');

    return true;
  });
}

// ========================================
// 6. WebSocket连接检查
// ========================================
async function checkWebSocket() {
  section('第6步: WebSocket服务检查');

  await test('WebSocket端点可用性', async () => {
    // 简单检查HTTP服务器是否响应
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });

    if (response.status === 200) {
      log(`   WebSocket服务运行在 ws://localhost:3000`, 'blue');
      log(`   (需要前端客户端连接才能完全验证)`, 'yellow');
      return true;
    }

    return false;
  });
}

// ========================================
// 主函数
// ========================================
async function main() {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║          AI交易系统 - 全面诊断测试                    ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝', 'cyan');

  const startTime = Date.now();

  try {
    await checkHealth();
    await checkDataFetching();
    await checkAIAnalysis();
    await checkHistory();
    await checkPerformance();
    await checkWebSocket();

  } catch (error) {
    log(`\n致命错误: ${error.message}`, 'red');
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // 最终报告
  section('诊断结果汇总');

  log(`总测试数: ${results.total}`, 'cyan');
  log(`✅ 通过: ${results.passed}`, 'green');
  log(`⚠️  警告: ${results.warnings}`, 'yellow');
  log(`❌ 失败: ${results.failed}`, 'red');
  log(`⏱️  总耗时: ${duration}秒`, 'cyan');

  const successRate = ((results.passed / results.total) * 100).toFixed(1);

  console.log('\n');
  if (results.failed === 0) {
    log('╔════════════════════════════════════════════════════════╗', 'green');
    log('║          ✅ 系统运行正常！成功率: ' + successRate + '%              ║', 'green');
    log('╚════════════════════════════════════════════════════════╝', 'green');
  } else if (results.failed < 3) {
    log('╔════════════════════════════════════════════════════════╗', 'yellow');
    log('║          ⚠️  系统部分功能异常                          ║', 'yellow');
    log('╚════════════════════════════════════════════════════════╝', 'yellow');
  } else {
    log('╔════════════════════════════════════════════════════════╗', 'red');
    log('║          ❌ 系统存在严重问题，请检查日志              ║', 'red');
    log('╚════════════════════════════════════════════════════════╝', 'red');
  }

  console.log('\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

// 运行诊断
main().catch(error => {
  log(`\n未捕获的错误: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
