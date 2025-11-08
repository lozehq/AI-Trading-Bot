// 中英文翻译配置
export const translations = {
  zh: {
    // Header
    'app.title': 'AI Trading Bot',
    'app.subtitle': '全自动交易助手',
    'header.autoTrading': '自动交易',
    'header.on': '开',
    'header.off': '关',
    'header.connected': '已连接',
    'header.disconnected': '未连接',
    'header.live': '实时',
    
    // Navigation Tabs
    'nav.dashboard': '仪表盘',
    'nav.trading': '交易',
    'nav.aiChat': 'AI对话',
    'nav.aiEnhanced': 'AI增强',
    'nav.positions': '持仓',
    'nav.dataSource': '数据源',
    'nav.performance': '绩效',
    
    // Dashboard
    'dashboard.title': '市场仪表盘',
    'dashboard.technicalIndicators': '技术指标',
    'dashboard.priceChange': '24h涨跌',
    'dashboard.volume': '24h成交量',
    'dashboard.high': '24h最高',
    'dashboard.low': '24h最低',
    
    // Trading Panel
    'trading.title': '交易控制台',
    'trading.selectPair': '交易对',
    'trading.getSignal': '获取交易信号',
    'trading.analyzing': '分析中...',
    'trading.aiAnalyze': 'DeepSeek AI 分析',
    'trading.aiAnalyzing': 'AI分析中...',
    'trading.execute': '执行交易',
    'trading.currentPrice': '当前价格',
    'trading.signal': '交易信号',
    'trading.confidence': '置信度',
    'trading.entryPrice': '入场价',
    'trading.stopLoss': '止损价',
    'trading.takeProfit': '止盈价',
    'trading.reasoning': '分析理由',
    'trading.riskLevel': '风险等级',
    'trading.aiAnalysis': 'AI 深度分析',
    'trading.aiSuggestion': 'AI建议',
    'trading.aiConfidence': 'AI置信度',
    
    // AI Chat
    'aiChat.title': 'AI对话助手',
    'aiChat.placeholder': '输入你的问题...',
    'aiChat.placeholderDisabled': 'AI暂不可用，但你可以使用Trading面板获取交易信号',
    'aiChat.send': '发送',
    'aiChat.thinking': 'AI思考中...',
    'aiChat.pressEnter': '按 Enter 发送，Shift + Enter 换行',
    'aiChat.quickQuestions': '试试这些问题：',
    'aiChat.q1': 'BTC现在适合买入吗？',
    'aiChat.q2': 'RSI指标是什么意思？',
    'aiChat.q3': 'MACD金叉是什么信号？',
    'aiChat.q4': '如何设置止损止盈？',
    
    // AI Enhanced
    'aiEnhanced.title': 'AI全面分析',
    'aiEnhanced.subtitle': '默认使用{count}个MCP工具获取全面数据',
    'aiEnhanced.analyze': '让AI分析',
    'aiEnhanced.analyzing': 'AI思考中...',
    'aiEnhanced.mcpTools': 'MCP数据工具（每次分析自动使用）',
    'aiEnhanced.autoUse': '每次点击"AI分析"，系统会自动使用所有MCP工具获取数据，然后交给AI进行全面分析',
    'aiEnhanced.result': 'AI深度分析结果',
    'aiEnhanced.keyPoints': '关键要点',
    'aiEnhanced.mcpDataUsed': 'MCP数据获取情况',
    'aiEnhanced.priceData': '实时价格',
    'aiEnhanced.indicators': '技术指标',
    'aiEnhanced.sentiment': '市场情绪',
    'aiEnhanced.coinDetail': '币种详情',
    'aiEnhanced.gainersLosers': '涨跌榜',
    'aiEnhanced.allToolsUsed': '使用了所有可用的MCP工具数据进行分析',
    
    // MCP Control
    'mcp.title': 'MCP 工具控制中心',
    'mcp.running': '个工具运行中',
    'mcp.masterSwitch': 'MCP 总开关',
    'mcp.clickToStop': '点击停止所有工具',
    'mcp.clickToStart': '点击启动所有工具',
    'mcp.refresh': '刷新状态',
    'mcp.startAll': '全部启动',
    'mcp.stopAll': '全部停止',
    'mcp.logs': 'MCP 工具日志',
    'mcp.hide': '隐藏',
    'mcp.show': '显示',
    'mcp.allTools': '所有工具',
    'mcp.autoRefresh': '自动刷新',
    'mcp.clear': '清除',
    'mcp.noLogs': '暂无日志',
    'mcp.totalTools': '总工具数',
    'mcp.runningTools': '运行中',
    'mcp.totalLogs': '日志总数',
    'mcp.toolsDescription': 'MCP工具说明',
    
    // Status
    'status.running': '运行中',
    'status.stopped': '已停止',
    'status.starting': '启动中',
    'status.stopping': '停止中',
    
    // Buttons
    'button.start': '启动',
    'button.stop': '停止',
    'button.restart': '重启',
    'button.refresh': '刷新',
    'button.clear': '清除',
    'button.execute': '执行',
    
    // Common
    'common.loading': '加载中...',
    'common.error': '错误',
    'common.success': '成功',
    'common.warning': '警告',
    'common.info': '信息',
    'common.confirm': '确认',
    'common.cancel': '取消',
    
    // Footer
    'footer.connected': '已连接',
    'footer.disconnected': '未连接',
    'footer.lastUpdate': '最后更新',
    'footer.version': '版本',
    'footer.poweredBy': 'Powered by DeepSeek AI & MCP Tools',
  },
  
  en: {
    // Header
    'app.title': 'AI Trading Bot',
    'app.subtitle': 'Automated Trading Assistant',
    'header.autoTrading': 'Auto Trading',
    'header.on': 'ON',
    'header.off': 'OFF',
    'header.connected': 'Connected',
    'header.disconnected': 'Disconnected',
    'header.live': 'Live',
    
    // Navigation Tabs
    'nav.dashboard': 'Dashboard',
    'nav.trading': 'Trading',
    'nav.aiChat': 'AI Chat',
    'nav.aiEnhanced': 'AI Enhanced',
    'nav.positions': 'Positions',
    'nav.dataSource': 'Data Source',
    'nav.performance': 'Performance',
    
    // Dashboard
    'dashboard.title': 'Market Dashboard',
    'dashboard.technicalIndicators': 'Technical Indicators',
    'dashboard.priceChange': '24h Change',
    'dashboard.volume': '24h Volume',
    'dashboard.high': '24h High',
    'dashboard.low': '24h Low',
    
    // Trading Panel
    'trading.title': 'Trading Console',
    'trading.selectPair': 'Trading Pair',
    'trading.getSignal': 'Get Trade Signal',
    'trading.analyzing': 'Analyzing...',
    'trading.aiAnalyze': 'DeepSeek AI Analysis',
    'trading.aiAnalyzing': 'AI Analyzing...',
    'trading.execute': 'Execute Trade',
    'trading.currentPrice': 'Current Price',
    'trading.signal': 'Trade Signal',
    'trading.confidence': 'Confidence',
    'trading.entryPrice': 'Entry Price',
    'trading.stopLoss': 'Stop Loss',
    'trading.takeProfit': 'Take Profit',
    'trading.reasoning': 'Analysis Reasoning',
    'trading.riskLevel': 'Risk Level',
    'trading.aiAnalysis': 'AI Deep Analysis',
    'trading.aiSuggestion': 'AI Suggestion',
    'trading.aiConfidence': 'AI Confidence',
    
    // AI Chat
    'aiChat.title': 'AI Chat Assistant',
    'aiChat.placeholder': 'Type your question...',
    'aiChat.placeholderDisabled': 'AI temporarily unavailable, but you can use Trading panel for signals',
    'aiChat.send': 'Send',
    'aiChat.thinking': 'AI thinking...',
    'aiChat.pressEnter': 'Press Enter to send, Shift + Enter for new line',
    'aiChat.quickQuestions': 'Try these questions:',
    'aiChat.q1': 'Is BTC suitable for buying now?',
    'aiChat.q2': 'What does RSI indicator mean?',
    'aiChat.q3': 'What is MACD golden cross signal?',
    'aiChat.q4': 'How to set stop loss and take profit?',
    
    // AI Enhanced
    'aiEnhanced.title': 'AI Comprehensive Analysis',
    'aiEnhanced.subtitle': 'Uses {count} MCP tools by default for comprehensive data',
    'aiEnhanced.analyze': 'Analyze',
    'aiEnhanced.analyzing': 'AI Thinking...',
    'aiEnhanced.mcpTools': 'MCP Data Tools (Auto-used in each analysis)',
    'aiEnhanced.autoUse': 'Every AI analysis automatically uses all MCP tools to gather data',
    'aiEnhanced.result': 'AI Deep Analysis Result',
    'aiEnhanced.keyPoints': 'Key Points',
    'aiEnhanced.mcpDataUsed': 'MCP Data Usage',
    'aiEnhanced.priceData': 'Real-time Price',
    'aiEnhanced.indicators': 'Technical Indicators',
    'aiEnhanced.sentiment': 'Market Sentiment',
    'aiEnhanced.coinDetail': 'Coin Details',
    'aiEnhanced.gainersLosers': 'Gainers/Losers',
    'aiEnhanced.allToolsUsed': 'Used all available MCP tools for analysis',
    
    // MCP Control
    'mcp.title': 'MCP Tools Control Center',
    'mcp.running': 'tools running',
    'mcp.masterSwitch': 'MCP Master Switch',
    'mcp.clickToStop': 'Click to stop all tools',
    'mcp.clickToStart': 'Click to start all tools',
    'mcp.refresh': 'Refresh Status',
    'mcp.startAll': 'Start All',
    'mcp.stopAll': 'Stop All',
    'mcp.logs': 'MCP Tools Logs',
    'mcp.hide': 'Hide',
    'mcp.show': 'Show',
    'mcp.allTools': 'All Tools',
    'mcp.autoRefresh': 'Auto Refresh',
    'mcp.clear': 'Clear',
    'mcp.noLogs': 'No logs yet',
    'mcp.totalTools': 'Total Tools',
    'mcp.runningTools': 'Running',
    'mcp.totalLogs': 'Total Logs',
    'mcp.toolsDescription': 'MCP Tools Description',
    
    // Status
    'status.running': 'Running',
    'status.stopped': 'Stopped',
    'status.starting': 'Starting',
    'status.stopping': 'Stopping',
    
    // Buttons
    'button.start': 'Start',
    'button.stop': 'Stop',
    'button.restart': 'Restart',
    'button.refresh': 'Refresh',
    'button.clear': 'Clear',
    'button.execute': 'Execute',
    
    // Common
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.warning': 'Warning',
    'common.info': 'Info',
    'common.confirm': 'Confirm',
    'common.cancel': 'Cancel',
    
    // Footer
    'footer.connected': 'Connected',
    'footer.disconnected': 'Disconnected',
    'footer.lastUpdate': 'Last Update',
    'footer.version': 'Version',
    'footer.poweredBy': 'Powered by DeepSeek AI & MCP Tools',
  }
};

// 默认语言
export const DEFAULT_LANGUAGE = 'zh';

