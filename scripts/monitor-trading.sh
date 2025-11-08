#!/bin/bash
# 交易监控脚本 - 每5分钟检查一次

while true; do
  echo "======================================"
  echo "交易监控 - $(date '+%Y-%m-%d %H:%M:%S')"
  echo "======================================"
  
  # 检查余额
  echo ""
  echo "📊 账户余额："
  curl -s "http://localhost:3000/api/okx/trade/balance?mode=live" | jq '.data.total'
  
  # 检查未成交订单
  echo ""
  echo "📋 未成交订单："
  curl -s "http://localhost:3000/api/okx/trade/open-orders?mode=live" | jq '.data | length'
  
  # 检查今日交易次数
  echo ""
  echo "📈 今日交易统计："
  sqlite3 data/trading.db "SELECT COUNT(*) as count FROM trades WHERE DATE(created_at) = DATE('now');" | tail -1
  
  # 检查今日盈亏
  echo ""
  echo "💰 今日盈亏："
  sqlite3 data/trading.db "SELECT SUM(CASE WHEN side='SELL' THEN total ELSE -total END) as pnl FROM trades WHERE DATE(created_at) = DATE('now') AND status='FILLED';" | tail -1
  
  echo ""
  echo "======================================"
  
  # 每5分钟执行一次
  sleep 300
done

