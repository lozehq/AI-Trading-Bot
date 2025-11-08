/**
 * 预警创建服务
 * 将AI的预警建议自动转换为实际的预警设置
 */

// 使用V2版本（数据库持久化）
const priceAlertServiceV2 = require('./priceAlertServiceV2');

class AlertCreatorService {
  constructor() {
    console.log('🔔 AlertCreatorService 初始化开始（使用V2数据库版本）...');
    try {
      this.alertService = priceAlertServiceV2;
      console.log('✅ 预警服务V2初始化成功');
      console.log('🔍 预警服务实例类型:', typeof this.alertService);
      console.log('🔍 预警服务方法检查:', {
        createAlert: typeof this.alertService.createAlert,
        getAllAlerts: typeof this.alertService.getAllAlerts,
        deleteAlert: typeof this.alertService.deleteAlert,
        updateAlert: typeof this.alertService.updateAlert
      });
    } catch (error) {
      console.error('❌ 预警服务初始化失败:', error);
      console.error('   错误堆栈:', error.stack);
      throw error;
    }
  }

  // ===== 预警合理性校验 =====
  validateSuggestion(suggestion, marketData, existingAlerts) {
    const reasons = [];
    const currentPrice = Number(marketData.price || marketData.ticker?.last);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      return { valid: false, reason: '无法获取现价' };
    }

    // 动态阈值：基于ATR与百分比双重约束
    const atr = Number(marketData.indicators?.volatility?.atr14 || 0);
    const atrPct = atr > 0 ? atr / currentPrice : 0;
    const minDistancePct = Math.max(0.003, atrPct * 0.5);   // ≥0.3% 或 0.5*ATR%
    const maxDistancePct = Math.max(0.05, atrPct * 3.0);    // ≥5% 或 3*ATR%

    const price = Number(suggestion.price);
    const range = Number.isFinite(suggestion.range) ? suggestion.range : 0.005;
    if (!Number.isFinite(price) || price <= 0) {
      return { valid: false, reason: 'price 无效' };
    }
    const dist = Math.abs(price - currentPrice) / currentPrice;
    if (dist < minDistancePct) {
      reasons.push(`距离现价过近(<${(minDistancePct*100).toFixed(2)}%)`);
    }
    if (dist > maxDistancePct) {
      reasons.push(`距离现价过远(>${(maxDistancePct*100).toFixed(2)}%)`);
    }

    // 每币种活跃预警上限（默认50，可通过 env 覆盖）
    const MAX_PER_SYMBOL = Number(process.env.PRICE_ALERT_MAX_PER_SYMBOL || 50);
    const activeForSymbol = Array.isArray(existingAlerts)
      ? existingAlerts.filter(a => a.symbol === (marketData.symbol || ''))
      : [];
    if (activeForSymbol.length >= MAX_PER_SYMBOL) {
      reasons.push(`已达上限(${MAX_PER_SYMBOL})`);
    }

    // 合理化range边界，防止极端值
    const clampedRange = Math.min(Math.max(range, 0.003), 0.05);

    const valid = reasons.length === 0;
    return { valid, reason: reasons.join('；'), normalized: { ...suggestion, range: clampedRange } };
  }

  /**
   * 根据AI分析结果创建预警
   * @param {Object} analysis - AI分析结果
   * @param {Object} marketData - 市场数据
   * @returns {Array} 创建的预警列表
   */
  async createAlertsFromAnalysis(analysis, marketData) {
    const alerts = [];
    const rejected = [];
    const symbol = marketData.symbol || 'BTC/USDT';
    const exchange = marketData.exchange || 'binance';

    // 检查是否有预警建议
    if (!analysis.alertSuggestions || !Array.isArray(analysis.alertSuggestions)) {
      console.log('🔔 无预警建议，跳过预警创建');
      return alerts;
    }

    console.log(`🔔 处理 ${analysis.alertSuggestions.length} 个预警建议`);
    console.log('🔍 预警建议详情:', JSON.stringify(analysis.alertSuggestions, null, 2));

    // 获取当前活跃的预警（按面板隔离）
    const contextId = marketData.contextId || marketData.contextOptions?.contextId || null;
    const existingAlerts = this.getActiveAlerts(symbol, contextId);


    for (const rawSuggestion of analysis.alertSuggestions) {
      try {
        // 合理性校验
        const check = this.validateSuggestion(rawSuggestion, marketData, existingAlerts);
        if (!check.valid) {
          rejected.push({ suggestion: rawSuggestion, reason: check.reason });
          console.log(`⛔ 拒绝不合理预警:`, rawSuggestion, '原因:', check.reason);
          continue;
        }
        const alertSuggestion = check.normalized || rawSuggestion;

        // 检查是否已存在相似的预警
        const isDuplicate = this.checkDuplicateAlert(alertSuggestion, existingAlerts);

        if (isDuplicate) {
          console.log(`⏭️ 跳过重复预警: ${alertSuggestion.type} @ ${alertSuggestion.price}`);
          continue;
        }

        const created = await this.createAlertFromSuggestion(alertSuggestion, symbol, exchange, contextId);
        const pushOne = (res) => {
          // 期望V2服务返回 { success, alertId, alert }
          const row = res && res.alert ? res.alert : null;
          if (row) {
            alerts.push(row);
            existingAlerts.push(row);
          }
        };
        if (Array.isArray(created)) {
          created.forEach(pushOne);
        } else if (created) {
          pushOne(created);
        }
      } catch (error) {
        console.error(`❌ 创建预警失败: ${error.message}`, alertSuggestion);
      }
    }

    console.log(`✅ 成功创建 ${alerts.length} 个预警 (跳过 ${analysis.alertSuggestions.length - alerts.length - rejected.length} 个重复, 拒绝 ${rejected.length} 个不合理)`);
    // 将拒绝原因挂到analysis，供上层汇总
    if (!analysis.alertManagement) analysis.alertManagement = {};
    analysis.alertManagement.rejected = rejected;
    return alerts;
  }

  /**
   * 检查是否存在重复的预警
   * @param {Object} suggestion - 预警建议
   * @param {Array} existingAlerts - 已存在的预警列表
   * @returns {boolean} 是否重复
   */
  checkDuplicateAlert(suggestion, existingAlerts) {
    const { type, price, range = 0.005 } = suggestion;
    const basePrice = Number(price);
    if (!Number.isFinite(basePrice) || basePrice <= 0) return false;

    // 检查是否有相同类型且价格接近的预警（兼容 V2 字段 target_price 及旧字段 price）
    const safeRange = Number.isFinite(range) ? range : 0.005;
    return existingAlerts.some(alert => {
      const alertType = alert.type;
      const target = Number(alert.target_price ?? alert.price);
      if (!Number.isFinite(target) || target <= 0) return false;

      const typeMatch = this.alertTypesMatch(alertType, type);
      const priceMatch = Math.abs(target - basePrice) / basePrice < safeRange;
      return typeMatch && priceMatch;
    });
  }

  /**
   * 检查预警类型是否匹配
   * @param {string} alertType - 已存在的预警类型
   * @param {string} suggestionType - 建议的预警类型
   * @returns {boolean} 是否匹配
   */
  alertTypesMatch(alertType, suggestionType) {
    // 类型映射
    const typeMap = {
      'stop_loss': ['below', 'stop_loss'],
      'take_profit': ['above', 'take_profit'],
      'breakout': ['cross', 'breakout', 'breakout_upper', 'breakout_lower'],
      'volatility': ['both', 'volatility']
    };

    // 检查是否在同一组
    for (const [key, types] of Object.entries(typeMap)) {
      if (types.includes(alertType) && types.includes(suggestionType)) {
        return true;
      }
    }

    return alertType === suggestionType;
  }

  /**
   * 根据单个预警建议创建预警
   * @param {Object} suggestion - 预警建议
   * @param {string} symbol - 交易对
   * @param {string} exchange - 交易所
   * @returns {Object|null} 创建的预警或null
   */
  async createAlertFromSuggestion(suggestion, symbol, exchange, contextId = null) {
    const { type, price, range = 0.005, direction = 'both', reason = '' } = suggestion;

    // 严格验证必要字段
    if (!type) {
      console.warn('⚠️ 预警建议缺少 type 字段:', suggestion);
      return null;
    }

    if (!Number.isFinite(price) || price <= 0) {
      console.warn('⚠️ 预警建议的 price 字段无效:', { price, type, suggestion });
      return null;
    }

    // 根据预警类型设置预警配置
    let alertConfig = {
      symbol,
      exchange,
      targetPrice: price, // 先占位，后续按类型调整
      message: this.generateAlertMessage(type, price, reason),
      source: 'ai',
      contextId,
      notification: {
        email: false, // 默认不发送邮件
        webhook: false, // 默认不发送webhook
        browser: true, // 默认开启浏览器通知
        sound: true    // 默认开启声音
      },
      repeat: false // 默认不重复触发
    };

    // 根据类型设置预警方向和价格
    switch (type) {
      case 'stop_loss':
        alertConfig.type = 'below';
        alertConfig.targetPrice = this.calculateAlertPrice(price, range, 'below');
        alertConfig.message = `止损预警: ${symbol} 价格接近止损位 ${price} (${reason})`;
        break;

      case 'take_profit':
        alertConfig.type = 'above';
        alertConfig.targetPrice = this.calculateAlertPrice(price, range, 'above');
        alertConfig.message = `止盈预警: ${symbol} 价格接近止盈位 ${price} (${reason})`;
        break;

      case 'breakout':
        if (direction === 'both') {
          // 双向突破预警需要创建两个预警
          const upperAlert = await this.createAlertFromSuggestion({
            ...suggestion,
            type: 'breakout_upper',
            direction: 'above'
          }, symbol, exchange, contextId);
          
          const lowerAlert = await this.createAlertFromSuggestion({
            ...suggestion,
            type: 'breakout_lower', 
            direction: 'below'
          }, symbol, exchange, contextId);

          // 扁平化返回
          return [upperAlert, lowerAlert].flat().filter(Boolean);
        } else {
          alertConfig.type = direction;
          alertConfig.targetPrice = this.calculateAlertPrice(price, range, direction);
          alertConfig.message = `突破预警: ${symbol} 价格${direction === 'above' ? '突破' : '跌破'} ${price} (${reason})`;
        }
        break;

      case 'volatility':
        alertConfig.type = 'both'; // 波动预警通常是双向的
        alertConfig.targetPrice = price;
        alertConfig.message = `波动预警: ${symbol} 价格波动超过阈值 (${reason})`;
        break;

      default:
        console.warn(`⚠️ 未知的预警类型: ${type}`);
        return null;
    }

    try {
      console.log('🔍 开始调用 alertService.createAlert()');
      console.log('🔍 预警配置:', JSON.stringify(alertConfig, null, 2));
      
      const created = await this.alertService.createAlert(alertConfig);
      if (created.success) {
        console.log(`✅ 创建预警成功: ${symbol} ${alertConfig.type} ${alertConfig.targetPrice} (${reason})`);
        console.log('🔍 创建的预警ID:', created.alertId);
      } else {
        console.error(`❌ 创建预警失败: ${created.error}`);
      }
      return created;
    } catch (error) {
      console.error(`❌ 创建预警失败:`, error);
      console.error('   错误堆栈:', error.stack);
      return null;
    }
  }

  /**
   * 计算预警价格
   * @param {number} basePrice - 基础价格
   * @param {number} range - 预警范围
   * @param {string} direction - 方向
   * @returns {number} 计算后的预警价格
   */
  calculateAlertPrice(basePrice, range, direction) {
    const r = Number.isFinite(range) ? range : 0.005;
    const multiplier = direction === 'above' ? (1 + r) : (1 - r);
    return basePrice * multiplier;
  }

  /**
   * 生成预警消息
   * @param {string} type - 预警类型
   * @param {number} price - 价格
   * @param {string} reason - 原因
   * @returns {string} 预警消息
   */
  generateAlertMessage(type, price, reason) {
    const typeMap = {
      'stop_loss': '止损预警',
      'take_profit': '止盈预警',
      'breakout': '突破预警',
      'breakout_upper': '向上突破预警',
      'breakout_lower': '向下突破预警',
      'volatility': '波动预警'
    };

    const typeName = typeMap[type] || type;
    return `${typeName}: 价格接近 ${price} (${reason})`;
  }

  /**
   * 清理过期的预警
   * @param {string} symbol - 交易对（可选）
   */
  async cleanupExpiredAlerts(symbol = null) {
    await this.alertService.cleanupOldAlerts();
    console.log(`🧹 清理过期预警完成`);
  }

  /**
   * 获取当前活跃的预警
   * @param {string} symbol - 交易对（可选）
   * @returns {Array} 预警列表
   */
  getActiveAlerts(symbol = null, contextId = null) {
    // V2 API: getAllAlerts with filters
    return this.alertService.getAllAlerts({ symbol, enabled: true, contextId });
  }

  /**
   * 删除特定预警
   * @param {string} alertId - 预警ID
   * @returns {boolean} 是否删除成功
   */
  async deleteAlert(alertId) {
    return await this.alertService.deleteAlert(alertId);
  }

  /**
   * 基于AI决策自动生成预警建议
   * @param {Object} analysis - AI分析结果
   * @param {Object} marketData - 市场数据
   * @returns {Array} 自动生成的预警建议
   */
  generateAutoAlerts(analysis, marketData) {
    const suggestions = [];
    const currentPrice = marketData.price || marketData.ticker?.last;

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      console.warn('⚠️ 无法获取当前价格，跳过自动预警生成');
      return suggestions;
    }

    const decision = analysis?.decision || analysis;
    const { signal, entryPrice, stopLoss, takeProfit } = decision || {};

    console.log(`   🔍 自动预警生成: 信号=${signal}, 入场=${entryPrice}, 止损=${stopLoss}, 止盈=${takeProfit}`);

    // 根据交易信号生成预警
    if (signal === 'BUY' || signal === 'SELL') {
      // 止损预警（带范围调整）
      if (Number.isFinite(stopLoss) && stopLoss > 0) {
        const adjustedPrice = signal === 'BUY'
          ? stopLoss * 1.005  // 止损位上方0.5%
          : stopLoss * 0.995; // 止损位下方0.5%

        suggestions.push({
          type: 'stop_loss',
          price: adjustedPrice,
          range: 0.005,
          direction: signal === 'BUY' ? 'below' : 'above',
          reason: `止损预警: ${signal}信号止损位 $${stopLoss.toFixed(2)} 附近`
        });
        console.log(`      ✅ 生成止损预警 @ $${adjustedPrice.toFixed(2)}`);
      }

      // 止盈预警（带范围调整）
      if (Number.isFinite(takeProfit) && takeProfit > 0) {
        const adjustedPrice = signal === 'BUY'
          ? takeProfit * 0.99   // 止盈位下方1%
          : takeProfit * 1.01;  // 止盈位上方1%

        suggestions.push({
          type: 'take_profit',
          price: adjustedPrice,
          range: 0.01,
          direction: signal === 'BUY' ? 'above' : 'below',
          reason: `止盈预警: ${signal}信号止盈位 $${takeProfit.toFixed(2)} 附近`
        });
        console.log(`      ✅ 生成止盈预警 @ $${adjustedPrice.toFixed(2)}`);
      }

      // 入场预警（如果当前价格与入场价有差距）
      if (Number.isFinite(entryPrice) && entryPrice > 0) {
        const priceDiff = Math.abs(currentPrice - entryPrice) / currentPrice;
        if (priceDiff > 0.02) { // 差距超过2%
          suggestions.push({
            type: 'breakout',
            price: entryPrice,
            range: 0.003,
            direction: signal === 'BUY' ? 'below' : 'above',
            reason: `入场预警: 等待价格${signal === 'BUY' ? '回调' : '反弹'}至 $${entryPrice.toFixed(2)}`
          });
          console.log(`      ✅ 生成入场预警 @ $${entryPrice.toFixed(2)} (当前价格差距 ${(priceDiff * 100).toFixed(2)}%)`);
        }
      }
    }

    // 基于技术指标生成波动预警
    const atr = marketData.indicators?.volatility?.atr14;
    if (Number.isFinite(atr) && atr > 0) {
      const volatilityThreshold = currentPrice * 0.02; // 2%波动阈值
      if (atr > volatilityThreshold) {
        const atrPercent = (atr / currentPrice);
        suggestions.push({
          type: 'volatility',
          price: currentPrice,
          range: atrPercent,
          direction: 'both',
          reason: `高波动预警: ATR=${atr.toFixed(2)} (${(atrPercent * 100).toFixed(2)}%)`
        });
        console.log(`      ✅ 生成波动预警 @ $${currentPrice.toFixed(2)} (ATR ${(atrPercent * 100).toFixed(2)}%)`);
      }
    }

    if (suggestions.length === 0) {
      console.log('      ℹ️  无法生成预警建议（信号为HOLD或缺少关键价格数据）');
    }

    return suggestions;
  }

  /**
   * 智能预警管理（主入口）
   * @param {Object} analysis - AI分析结果
   * @param {Object} marketData - 市场数据
   * @returns {Object} 预警管理结果
   */
  async manageAlerts(analysis, marketData) {
    const result = {
      created: [],
      deleted: [],
      active: [],
      skipped: 0,
      rejected: [],
      source: 'none' // 'ai' | 'auto' | 'none'
    };

    try {
      console.log('\n🔔 ═══════════════════════════════════════════════════');
      console.log('🔔 智能预警管理系统启动');
      console.log('🔔 ═══════════════════════════════════════════════════');

      // 1. 清理过期预警
      console.log('🧹 步骤1/4: 清理过期预警...');
      this.cleanupExpiredAlerts();

      // 2. 获取当前活跃预警
      console.log('📋 步骤2/4: 获取当前活跃预警...');
      result.active = this.getActiveAlerts(marketData.symbol);
      console.log(`   当前活跃预警: ${result.active.length} 个`);

      // 3. 决定预警来源：AI建议 vs 自动生成
      console.log('🤖 步骤3/4: 分析预警来源...');

      if (analysis.alertSuggestions && Array.isArray(analysis.alertSuggestions) && analysis.alertSuggestions.length > 0) {
        // 使用AI的预警建议
        console.log(`   ✅ 使用AI预警建议 (${analysis.alertSuggestions.length} 个)`);
        result.source = 'ai';
        result.created = await this.createAlertsFromAnalysis(analysis, marketData);
        result.skipped = analysis.alertSuggestions.length - result.created.length;
        if (analysis.alertManagement && Array.isArray(analysis.alertManagement.rejected)) {
          result.rejected = analysis.alertManagement.rejected;
        }
      } else {
        // 自动生成预警建议
        console.log('   ⚙️  AI未提供预警建议，尝试自动生成...');

        // ⚠️ 临时禁用自动预警生成，防止预警过多
        const AUTO_ALERT_ENABLED = process.env.AUTO_ALERT_ENABLED !== 'false'; // 默认启用，设置环境变量 AUTO_ALERT_ENABLED=false 可禁用

        if (!AUTO_ALERT_ENABLED) {
          console.log('   ℹ️  自动预警生成已禁用 (AUTO_ALERT_ENABLED=false)');
          result.source = 'none';
        } else {
          const autoSuggestions = this.generateAutoAlerts(analysis, marketData);

          if (autoSuggestions.length > 0) {
            console.log(`   ✅ 自动生成 ${autoSuggestions.length} 个预警建议`);
            result.source = 'auto';
            analysis.alertSuggestions = autoSuggestions;
            result.created = await this.createAlertsFromAnalysis(analysis, marketData);
            result.skipped = autoSuggestions.length - result.created.length;
            if (analysis.alertManagement && Array.isArray(analysis.alertManagement.rejected)) {
              result.rejected = analysis.alertManagement.rejected;
            }
          } else {
            console.log('   ℹ️  无法生成预警建议（可能是HOLD信号或数据不足）');
            result.source = 'none';
          }
        }
      }

      // 4. 输出结果摘要
      console.log('📊 步骤4/4: 预警管理结果摘要');
      console.log(`   预警来源: ${result.source === 'ai' ? 'AI建议' : result.source === 'auto' ? '自动生成' : '无'}`);
      console.log(`   新建预警: ${result.created.length} 个`);
      console.log(`   跳过重复: ${result.skipped} 个`);
      console.log(`   活跃预警: ${result.active.length} 个`);

      if (result.created.length > 0) {
        console.log('\n   📋 新建预警详情:');
        result.created.forEach((alert, index) => {
          const typeLabel = {
            'stop_loss': '🛑 止损',
            'take_profit': '💰 止盈',
            'breakout': '🔥 突破',
            'volatility': '⚡ 波动'
          }[alert.type] || alert.type;
          const priceVal = alert.target_price ?? alert.price;
          console.log(`      ${index + 1}. ${typeLabel} @ $${priceVal} - ${alert.message}`);
        });
      }

      console.log('🔔 ═══════════════════════════════════════════════════');
      console.log('🔔 智能预警管理完成');
      console.log('🔔 ═══════════════════════════════════════════════════\n');

    } catch (error) {
      console.error('❌ 预警管理失败:', error);
      console.error('   错误详情:', error.stack);
      result.error = error.message;
    }

    return result;
  }
}

module.exports = new AlertCreatorService();