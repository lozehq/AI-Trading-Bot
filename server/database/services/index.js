/**
 * 数据库服务统一导出
 */

const { TradeService } = require('./TradeService');
const { SettingService } = require('./SettingService');
const { MCPLogService } = require('./MCPLogService');
const { MCPConfigService } = require('./MCPConfigService');
const { AlertService } = require('./AlertService');

module.exports = {
  TradeService,
  SettingService,
  MCPLogService,
  MCPConfigService,
  AlertService
};

