/**
 * 数据库类型定义
 * 对应SQLite数据库Schema
 */

// ============================================
// 1. 交易历史类型
// ============================================
export interface Trade {
  id?: number;
  symbol: string;
  exchange: string;
  side: 'BUY' | 'SELL';
  type?: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';
  price: number;
  amount: number;
  total: number;
  fee?: number;
  fee_currency?: string;
  status?: 'PENDING' | 'FILLED' | 'CANCELLED' | 'FAILED';
  order_id?: string;
  strategy?: string;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
  pnl?: number;
  pnl_percentage?: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================
// 2. 用户配置类型
// ============================================
export interface Setting {
  id?: number;
  key: string;
  value: string;
  type?: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';
  category?: 'GENERAL' | 'TRADING' | 'MCP' | 'AI';
  description?: string;
  is_encrypted?: boolean;
  created_at?: string;
  updated_at?: string;
}

// 配置值类型映射
export interface SettingValues {
  // 交易配置
  default_exchange: string;
  default_symbol: string;
  default_timeframe: string;
  risk_percentage: number;
  max_position_size: number;
  auto_trading_enabled: boolean;
  
  // MCP配置
  mcp_cache_ttl: number;
  
  // AI配置
  ai_temperature: number;
  ai_max_tokens: number;
}

// ============================================
// 3. MCP日志类型
// ============================================
export interface MCPLog {
  id?: number;
  tool_name: string;
  method: string;
  params?: string | object;
  result?: string | object;
  status?: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  error_message?: string;
  duration_ms?: number;
  created_at?: string;
}

// ============================================
// 4. 市场数据快照类型
// ============================================
export interface MarketSnapshot {
  id?: number;
  symbol: string;
  exchange: string;
  timeframe: string;
  price: number;
  volume_24h?: number;
  change_24h?: number;
  high_24h?: number;
  low_24h?: number;
  indicators?: string | object;
  created_at?: string;
}

// 技术指标类型
export interface TechnicalIndicators {
  rsi?: number;
  macd?: {
    MACD: number;
    signal: number;
    histogram: number;
  };
  bollinger?: {
    upper: number;
    middle: number;
    lower: number;
  };
  ema?: {
    ema9?: number;
    ema21?: number;
    ema50?: number;
    ema200?: number;
  };
  sma?: {
    sma20?: number;
    sma50?: number;
    sma200?: number;
  };
  atr?: number;
  stochastic?: {
    k: number;
    d: number;
  };
}

// ============================================
// 5. AI分析历史类型
// ============================================
export interface AIAnalysis {
  id?: number;
  symbol: string;
  exchange: string;
  timeframe: string;
  analysis_type?: 'FULL' | 'QUICK' | 'TECHNICAL';
  market_data?: string | object;
  indicators?: string | object;
  ai_response?: string | object;
  signal?: 'BUY' | 'SELL' | 'HOLD';
  confidence?: number;
  reasoning?: string;
  tools_used?: string | string[];
  duration_ms?: number;
  created_at?: string;
}

// AI响应类型
export interface AIResponse {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
  position_size?: number;
  risk_reward_ratio?: number;
}

// ============================================
// 6. 持仓记录类型
// ============================================
export interface Position {
  id?: number;
  symbol: string;
  exchange: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  amount: number;
  current_price?: number;
  stop_loss?: number;
  take_profit?: number;
  unrealized_pnl?: number;
  unrealized_pnl_percentage?: number;
  status?: 'OPEN' | 'CLOSED';
  entry_trade_id?: number;
  exit_trade_id?: number;
  notes?: string;
  opened_at?: string;
  closed_at?: string;
  updated_at?: string;
}

// ============================================
// 7. 策略绩效类型
// ============================================
export interface StrategyPerformance {
  id?: number;
  strategy_name: string;
  symbol: string;
  timeframe: string;
  total_trades?: number;
  winning_trades?: number;
  losing_trades?: number;
  win_rate?: number;
  total_pnl?: number;
  total_pnl_percentage?: number;
  max_drawdown?: number;
  sharpe_ratio?: number;
  avg_win?: number;
  avg_loss?: number;
  largest_win?: number;
  largest_loss?: number;
  created_at?: string;
  updated_at?: string;
}

// ============================================
// 8. 系统日志类型
// ============================================
export interface SystemLog {
  id?: number;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  category?: 'SYSTEM' | 'TRADING' | 'MCP' | 'AI';
  message: string;
  details?: string | object;
  stack_trace?: string;
  created_at?: string;
}

// ============================================
// 视图类型
// ============================================
export interface TradeStatistics {
  symbol: string;
  exchange: string;
  total_trades: number;
  buy_trades: number;
  sell_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
  max_pnl: number;
  min_pnl: number;
  total_volume: number;
}

export interface MCPStatistics {
  tool_name: string;
  method: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  success_rate: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  min_duration_ms: number;
}

// ============================================
// 查询参数类型
// ============================================
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  where?: Record<string, any>;
}

export interface DateRangeQuery {
  start_date?: string;
  end_date?: string;
}

export interface TradeQuery extends QueryOptions, DateRangeQuery {
  symbol?: string;
  exchange?: string;
  side?: 'BUY' | 'SELL';
  status?: string;
}

export interface AIAnalysisQuery extends QueryOptions, DateRangeQuery {
  symbol?: string;
  exchange?: string;
  signal?: 'BUY' | 'SELL' | 'HOLD';
  min_confidence?: number;
}

export interface MCPLogQuery extends QueryOptions, DateRangeQuery {
  tool_name?: string;
  method?: string;
  status?: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
}

