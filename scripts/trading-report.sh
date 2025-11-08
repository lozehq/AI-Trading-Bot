#!/bin/bash
# 交易表现报告

echo "======================================"
echo "📊 AI 自动交易表现报告"
echo "======================================"
echo ""

# 1. 总交易次数
echo "📈 总交易次数："
sqlite3 data/trading.db "SELECT COUNT(*) FROM trades WHERE status='FILLED';"

# 2. 胜率
echo ""
echo "🎯 胜率："
sqlite3 data/trading.db "
SELECT 
  ROUND(
    CAST(SUM(CASE WHEN (side='SELL' AND total > 0) OR (side='BUY' AND total < 0) THEN 1 ELSE 0 END) AS FLOAT) / 
    COUNT(*) * 100, 2
  ) || '%' as win_rate
FROM trades 
WHERE status='FILLED';
"

# 3. 总盈亏
echo ""
echo "💰 总盈亏（USDT）："
sqlite3 data/trading.db "
SELECT 
  ROUND(SUM(CASE 
    WHEN side='SELL' THEN total 
    ELSE -total 
  END), 2) as total_pnl
FROM trades 
WHERE status='FILLED';
"

# 4. 平均交易金额
echo ""
echo "💵 平均交易金额（USDT）："
sqlite3 data/trading.db "
SELECT ROUND(AVG(total), 2)
FROM trades 
WHERE status='FILLED';
"

# 5. 最近10笔交易
echo ""
echo "📋 最近10笔交易："
sqlite3 data/trading.db "
SELECT 
  symbol,
  side,
  ROUND(amount, 6) as amount,
  ROUND(price, 2) as price,
  ROUND(total, 2) as total,
  status,
  strftime('%Y-%m-%d %H:%M', created_at) as time
FROM trades 
ORDER BY created_at DESC 
LIMIT 10;
" -header -column

# 6. 按交易对统计
echo ""
echo "📊 按交易对统计："
sqlite3 data/trading.db "
SELECT 
  symbol,
  COUNT(*) as trades,
  ROUND(SUM(CASE WHEN side='SELL' THEN total ELSE -total END), 2) as pnl
FROM trades 
WHERE status='FILLED'
GROUP BY symbol
ORDER BY pnl DESC;
" -header -column

echo ""
echo "======================================"
echo "📅 报告生成时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"

