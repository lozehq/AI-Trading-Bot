-- ============================================
-- AI Trading Bot 数据库Schema
-- 数据库类型: SQLite
-- 创建时间: 2025-10-22
-- ============================================

-- ============================================
-- 1. 交易历史表
-- ============================================
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol VARCHAR(20) NOT NULL,                -- 交易对 (如 ETH/USDT)
    exchange VARCHAR(50) NOT NULL,              -- 交易所 (如 binance)
    side VARCHAR(10) NOT NULL,                  -- 买卖方向 (BUY/SELL)
    type VARCHAR(20) DEFAULT 'MARKET',          -- 订单类型 (MARKET/LIMIT)
    price DECIMAL(20, 8) NOT NULL,              -- 成交价格
    amount DECIMAL(20, 8) NOT NULL,             -- 成交数量
    total DECIMAL(20, 8) NOT NULL,              -- 总金额
    fee DECIMAL(20, 8) DEFAULT 0,               -- 手续费
    fee_currency VARCHAR(10),                   -- 手续费币种
    status VARCHAR(20) DEFAULT 'PENDING',       -- 状态 (PENDING/FILLED/CANCELLED/FAILED)
    order_id VARCHAR(100),                      -- 交易所订单ID
    strategy VARCHAR(50),                       -- 使用的策略
    entry_price DECIMAL(20, 8),                 -- 入场价格
    stop_loss DECIMAL(20, 8),                   -- 止损价格
    take_profit DECIMAL(20, 8),                 -- 止盈价格
    pnl DECIMAL(20, 8),                         -- 盈亏
    pnl_percentage DECIMAL(10, 4),              -- 盈亏百分比
    notes TEXT,                                 -- 备注
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_exchange ON trades(exchange);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);

-- ============================================
-- 2. 用户配置表
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key VARCHAR(100) UNIQUE NOT NULL,           -- 配置键
    value TEXT,                                 -- 配置值 (JSON格式)
    type VARCHAR(20) DEFAULT 'STRING',          -- 数据类型 (STRING/NUMBER/BOOLEAN/JSON)
    category VARCHAR(50) DEFAULT 'GENERAL',     -- 分类 (GENERAL/TRADING/MCP/AI)
    description TEXT,                           -- 描述
    is_encrypted BOOLEAN DEFAULT 0,             -- 是否加密
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认配置
INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
('default_exchange', 'binance', 'STRING', 'TRADING', '默认交易所'),
('default_symbol', 'ETH/USDT', 'STRING', 'TRADING', '默认交易对'),
('default_timeframe', '1h', 'STRING', 'TRADING', '默认时间周期'),
('risk_percentage', '0.02', 'NUMBER', 'TRADING', '每笔交易风险百分比'),
('max_position_size', '10000', 'NUMBER', 'TRADING', '最大仓位大小'),
('auto_trading_enabled', 'false', 'BOOLEAN', 'TRADING', '是否启用自动交易'),
('mcp_cache_ttl', '60000', 'NUMBER', 'MCP', 'MCP缓存时间(毫秒)'),
('ai_temperature', '0.3', 'NUMBER', 'AI', 'AI温度参数'),
('ai_max_tokens', '2000', 'NUMBER', 'AI', 'AI最大token数');

-- ============================================
-- 3. MCP工具日志表
-- ============================================
CREATE TABLE IF NOT EXISTS mcp_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_name VARCHAR(50) NOT NULL,             -- MCP工具名称
    method VARCHAR(100) NOT NULL,               -- 调用的方法
    params TEXT,                                -- 参数 (JSON格式)
    result TEXT,                                -- 返回结果 (JSON格式)
    status VARCHAR(20) DEFAULT 'SUCCESS',       -- 状态 (SUCCESS/FAILED/TIMEOUT)
    error_message TEXT,                         -- 错误信息
    duration_ms INTEGER,                        -- 执行时长(毫秒)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_mcp_logs_tool_name ON mcp_logs(tool_name);
CREATE INDEX IF NOT EXISTS idx_mcp_logs_created_at ON mcp_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_mcp_logs_status ON mcp_logs(status);

-- ============================================
-- 4. 市场数据快照表
-- ============================================
CREATE TABLE IF NOT EXISTS market_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol VARCHAR(20) NOT NULL,                -- 交易对
    exchange VARCHAR(50) NOT NULL,              -- 交易所
    timeframe VARCHAR(10) NOT NULL,             -- 时间周期
    price DECIMAL(20, 8) NOT NULL,              -- 当前价格
    volume_24h DECIMAL(20, 8),                  -- 24小时成交量
    change_24h DECIMAL(10, 4),                  -- 24小时涨跌幅
    high_24h DECIMAL(20, 8),                    -- 24小时最高价
    low_24h DECIMAL(20, 8),                     -- 24小时最低价
    indicators TEXT,                            -- 技术指标 (JSON格式)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol ON market_snapshots(symbol);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_created_at ON market_snapshots(created_at);

-- ============================================
-- 5. AI分析历史表（已移至第9节，此处删除重复定义）
-- ============================================

-- ============================================
-- 6. 持仓记录表
-- ============================================
CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol VARCHAR(20) NOT NULL,                -- 交易对
    exchange VARCHAR(50) NOT NULL,              -- 交易所
    side VARCHAR(10) NOT NULL,                  -- 方向 (LONG/SHORT)
    entry_price DECIMAL(20, 8) NOT NULL,        -- 入场价格
    amount DECIMAL(20, 8) NOT NULL,             -- 持仓数量
    current_price DECIMAL(20, 8),               -- 当前价格
    stop_loss DECIMAL(20, 8),                   -- 止损价格
    take_profit DECIMAL(20, 8),                 -- 止盈价格
    unrealized_pnl DECIMAL(20, 8),              -- 未实现盈亏
    unrealized_pnl_percentage DECIMAL(10, 4),   -- 未实现盈亏百分比
    status VARCHAR(20) DEFAULT 'OPEN',          -- 状态 (OPEN/CLOSED)
    entry_trade_id INTEGER,                     -- 入场交易ID
    exit_trade_id INTEGER,                      -- 出场交易ID
    notes TEXT,                                 -- 备注
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_trade_id) REFERENCES trades(id),
    FOREIGN KEY (exit_trade_id) REFERENCES trades(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_opened_at ON positions(opened_at);

-- ============================================
-- 7. 策略绩效表
-- ============================================
CREATE TABLE IF NOT EXISTS strategy_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_name VARCHAR(50) NOT NULL,         -- 策略名称
    symbol VARCHAR(20) NOT NULL,                -- 交易对
    timeframe VARCHAR(10) NOT NULL,             -- 时间周期
    total_trades INTEGER DEFAULT 0,             -- 总交易次数
    winning_trades INTEGER DEFAULT 0,           -- 盈利交易次数
    losing_trades INTEGER DEFAULT 0,            -- 亏损交易次数
    win_rate DECIMAL(5, 2),                     -- 胜率
    total_pnl DECIMAL(20, 8) DEFAULT 0,         -- 总盈亏
    total_pnl_percentage DECIMAL(10, 4),        -- 总盈亏百分比
    max_drawdown DECIMAL(10, 4),                -- 最大回撤
    sharpe_ratio DECIMAL(10, 4),                -- 夏普比率
    avg_win DECIMAL(20, 8),                     -- 平均盈利
    avg_loss DECIMAL(20, 8),                    -- 平均亏损
    largest_win DECIMAL(20, 8),                 -- 最大盈利
    largest_loss DECIMAL(20, 8),                -- 最大亏损
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_strategy_performance_name ON strategy_performance(strategy_name);
CREATE INDEX IF NOT EXISTS idx_strategy_performance_symbol ON strategy_performance(symbol);

-- ============================================
-- 8. 系统事件日志表
-- ============================================
CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level VARCHAR(20) NOT NULL,                 -- 日志级别 (INFO/WARN/ERROR/DEBUG)
    category VARCHAR(50) DEFAULT 'SYSTEM',      -- 分类 (SYSTEM/TRADING/MCP/AI)
    message TEXT NOT NULL,                      -- 日志消息
    details TEXT,                               -- 详细信息 (JSON格式)
    stack_trace TEXT,                           -- 错误堆栈
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);

-- ============================================
-- 11. API Keys 表（安全认证）
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key VARCHAR(64) UNIQUE NOT NULL,            -- API Key
    secret VARCHAR(128),                        -- API Secret (用于高风险操作)
    name VARCHAR(100),                          -- Key 名称/描述
    permissions TEXT,                           -- 权限列表 (JSON数组)
    ip_whitelist TEXT,                          -- IP 白名单 (JSON数组)
    is_active BOOLEAN DEFAULT 1,                -- 是否启用
    expires_at DATETIME,                        -- 过期时间
    last_used_at DATETIME,                      -- 最后使用时间
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);

-- ============================================
-- 9. AI分析历史表
-- ============================================
CREATE TABLE IF NOT EXISTS ai_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol VARCHAR(20) NOT NULL,                -- 交易对 (如 ETH/USDT)
    exchange VARCHAR(50) NOT NULL,              -- 交易所 (如 okx)
    signal VARCHAR(20),                         -- 信号 (BUY/SELL/HOLD)
    confidence DECIMAL(5, 2),                   -- 置信度 (0-100)
    entry_price DECIMAL(20, 8),                 -- 入场价格
    stop_loss DECIMAL(20, 8),                   -- 止损价格
    take_profit DECIMAL(20, 8),                 -- 止盈价格
    reasoning TEXT,                             -- AI推理过程
    risk_level VARCHAR(20),                     -- 风险等级 (LOW/MEDIUM/HIGH)
    market_data TEXT,                           -- 市场数据快照 (JSON)
    indicators TEXT,                            -- 技术指标快照 (JSON)
    tools_used TEXT,                            -- 使用的MCP工具 (JSON数组)
    indicators_summary TEXT,                    -- 技术指标摘要
    analysis_result TEXT,                       -- 完整分析结果 (JSON)
    is_favorite INTEGER DEFAULT 0,             -- 是否收藏
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ai_analyses_symbol ON ai_analyses(symbol);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_exchange ON ai_analyses(exchange);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_created_at ON ai_analyses(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_signal ON ai_analyses(signal);

-- ============================================
-- 9. 价格预警表
-- ============================================
CREATE TABLE IF NOT EXISTS price_alerts (
    id TEXT PRIMARY KEY,                        -- 预警ID (alert_timestamp_random)
    symbol VARCHAR(20) NOT NULL,                -- 交易对
    exchange VARCHAR(50) DEFAULT 'binance',     -- 交易所
    type VARCHAR(20) NOT NULL,                  -- 预警类型 (above/below/cross/stop_loss/take_profit/breakout/volatility)
    price DECIMAL(20, 8) NOT NULL,              -- 预警价格
    message TEXT,                               -- 预警消息
    notification_email INTEGER DEFAULT 0,       -- 是否邮件通知
    notification_webhook INTEGER DEFAULT 0,     -- 是否webhook通知
    notification_browser INTEGER DEFAULT 1,     -- 是否浏览器通知
    notification_sound INTEGER DEFAULT 1,       -- 是否声音提醒
    repeat INTEGER DEFAULT 0,                   -- 是否重复触发
    enabled INTEGER DEFAULT 1,                  -- 是否启用
    last_triggered DATETIME,                    -- 最后触发时间
    trigger_count INTEGER DEFAULT 0,            -- 触发次数
    cooldown_until DATETIME,                    -- 冷却结束时间
    source VARCHAR(20) DEFAULT 'manual',        -- 预警来源 (ai/auto/manual)
    reason TEXT,                                -- 预警原因
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol ON price_alerts(symbol);
CREATE INDEX IF NOT EXISTS idx_price_alerts_enabled ON price_alerts(enabled);
CREATE INDEX IF NOT EXISTS idx_price_alerts_type ON price_alerts(type);
CREATE INDEX IF NOT EXISTS idx_price_alerts_created_at ON price_alerts(created_at);

-- ============================================
-- 10. 预警触发历史表
-- ============================================
CREATE TABLE IF NOT EXISTS alert_triggers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id TEXT NOT NULL,                     -- 预警ID
    symbol VARCHAR(20) NOT NULL,                -- 交易对
    trigger_price DECIMAL(20, 8) NOT NULL,      -- 触发时的价格
    alert_price DECIMAL(20, 8) NOT NULL,        -- 预警设置的价格
    type VARCHAR(20) NOT NULL,                  -- 预警类型
    message TEXT,                               -- 触发消息
    notification_sent INTEGER DEFAULT 0,        -- 是否已发送通知
    triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (alert_id) REFERENCES price_alerts(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_alert_triggers_alert_id ON alert_triggers(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_triggers_symbol ON alert_triggers(symbol);
CREATE INDEX IF NOT EXISTS idx_alert_triggers_triggered_at ON alert_triggers(triggered_at);

-- ============================================
-- 视图: 交易统计
-- ============================================
CREATE VIEW IF NOT EXISTS v_trade_statistics AS
SELECT 
    symbol,
    exchange,
    COUNT(*) as total_trades,
    SUM(CASE WHEN side = 'BUY' THEN 1 ELSE 0 END) as buy_trades,
    SUM(CASE WHEN side = 'SELL' THEN 1 ELSE 0 END) as sell_trades,
    SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
    SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
    ROUND(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as win_rate,
    SUM(pnl) as total_pnl,
    AVG(pnl) as avg_pnl,
    MAX(pnl) as max_pnl,
    MIN(pnl) as min_pnl,
    SUM(total) as total_volume
FROM trades
WHERE status = 'FILLED'
GROUP BY symbol, exchange;

-- ============================================
-- 视图: MCP工具使用统计
-- ============================================
CREATE VIEW IF NOT EXISTS v_mcp_statistics AS
SELECT 
    tool_name,
    method,
    COUNT(*) as total_calls,
    SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as successful_calls,
    SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_calls,
    ROUND(SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate,
    AVG(duration_ms) as avg_duration_ms,
    MAX(duration_ms) as max_duration_ms,
    MIN(duration_ms) as min_duration_ms
FROM mcp_logs
GROUP BY tool_name, method;

-- ============================================
-- 自定义MCP配置表
-- ============================================
CREATE TABLE IF NOT EXISTS mcp_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_id TEXT UNIQUE NOT NULL,
    command TEXT NOT NULL,
    args TEXT,
    env TEXT,
    working_directory TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 完成
-- ============================================

