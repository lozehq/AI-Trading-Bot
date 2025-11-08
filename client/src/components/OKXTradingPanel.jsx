import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  TrendingUp, TrendingDown, DollarSign, Shield, AlertTriangle,
  Settings, RefreshCw, CheckCircle, XCircle, Info, Zap
} from 'lucide-react';

function OKXTradingPanel() {
  const [tradingMode, setTradingMode] = useState(() => localStorage.getItem('tradingMode') || 'paper');
  const [marketType, setMarketType] = useState('spot'); // spot, swap, futures
  const [balance, setBalance] = useState(null);
  const [accountInfo, setAccountInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // 订单表单
  const [orderForm, setOrderForm] = useState({
    symbol: 'BTC/USDT',
    side: 'BUY',
    type: 'LIMIT',
    amount: '',
    price: '',
    stopLoss: '',
    takeProfit: '',
    leverage: 1 // 仅合约
  });
  
  // 当前价格
  const [currentPrice, setCurrentPrice] = useState(null);
  
  // 订单历史
  const [orders, setOrders] = useState([]);
  
  useEffect(() => {
    fetchData();
    fetchCurrentPrice();
    
    const interval = setInterval(() => {
      fetchData();
      fetchCurrentPrice();
    }, 5000);
    
    // 监听交易模式切换
    const handleModeChange = (e) => {
      setTradingMode(e.detail.mode);
      fetchData();
    };
    window.addEventListener('tradingModeChanged', handleModeChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('tradingModeChanged', handleModeChange);
    };
  }, [tradingMode]);
  
  const fetchData = async () => {
    try {
      // 获取余额
      const balanceRes = await axios.get(`/api/okx/trade/balance?mode=${tradingMode}`);
      setBalance(balanceRes.data.data);
      
      // 获取账户详细信息
      const accountRes = await axios.get(`/api/okx/trade/account?mode=${tradingMode}`);
      setAccountInfo(accountRes.data.data);
      
      // 获取未成交订单
      const ordersRes = await axios.get(`/api/okx/trade/open-orders?mode=${tradingMode}`);
      setOrders(ordersRes.data.data || []);
    } catch (error) {
      console.error('获取数据失败:', error);
    }
  };
  
  const fetchCurrentPrice = async () => {
    try {
      const res = await axios.get(`/api/market/ticker?symbol=${orderForm.symbol}`);
      setCurrentPrice(res.data.data?.price);
    } catch (error) {
      console.error('获取价格失败:', error);
    }
  };
  
  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const payload = {
        symbol: orderForm.symbol,
        side: orderForm.side,
        type: orderForm.type,
        amount: parseFloat(orderForm.amount),
        mode: tradingMode
      };
      
      // 限价单需要价格
      if (orderForm.type === 'LIMIT') {
        payload.price = parseFloat(orderForm.price);
      }
      
      // 添加止损止盈
      if (orderForm.stopLoss || orderForm.takeProfit) {
        payload.params = {};
        if (orderForm.stopLoss) payload.params.stopLoss = parseFloat(orderForm.stopLoss);
        if (orderForm.takeProfit) payload.params.takeProfit = parseFloat(orderForm.takeProfit);
      }
      
      const response = await axios.post('/api/okx/trade/order', payload);
      
      if (response.data.success) {
        alert('订单提交成功！');
        fetchData();
        // 重置表单（保留交易对）
        setOrderForm(prev => ({
          ...prev,
          amount: '',
          price: '',
          stopLoss: '',
          takeProfit: ''
        }));
      }
    } catch (error) {
      alert('下单失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };
  
  const handleCancelOrder = async (orderId, symbol) => {
    try {
      await axios.post('/api/okx/trade/cancel', {
        id: orderId,
        symbol: symbol,
        mode: tradingMode
      });
      alert('订单已取消');
      fetchData();
    } catch (error) {
      alert('取消失败: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const calculateTotal = () => {
    const amount = parseFloat(orderForm.amount) || 0;
    const price = orderForm.type === 'MARKET' 
      ? (currentPrice || 0) 
      : (parseFloat(orderForm.price) || 0);
    return (amount * price).toFixed(2);
  };
  
  const getAvailableBalance = () => {
    if (!balance || !balance.free) return 0;
    const quote = orderForm.symbol.split('/')[1]; // USDT
    return balance.free[quote] || 0;
  };
  
  const getModeColor = () => {
    switch(tradingMode) {
      case 'paper': return 'blue';
      case 'demo': return 'purple';
      case 'live': return 'red';
      default: return 'gray';
    }
  };
  
  const getModeLabel = () => {
    switch(tradingMode) {
      case 'paper': return '📝 纸上交易';
      case 'demo': return '🧪 OKX模拟';
      case 'live': return '⚠️ 真实交易';
      default: return '未知模式';
    }
  };
  
  return (
    <div className="space-y-6">
      {/* 顶部状态栏 */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`px-4 py-2 rounded-lg bg-${getModeColor()}-500/20 border border-${getModeColor()}-500`}>
              <span className="font-bold">{getModeLabel()}</span>
            </div>
            
            {tradingMode === 'live' && (
              <div className="flex items-center space-x-2 text-red-500">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">真实资金！请谨慎操作</span>
              </div>
            )}
          </div>
          
          <button 
            onClick={fetchData}
            className="btn-secondary flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>刷新</span>
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：下单面板 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 账户余额 */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <DollarSign className="w-5 h-5 mr-2 text-green-500" />
              账户余额
            </h3>
            
            {accountInfo ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-dark-muted mb-1">总资产</div>
                  <div className="text-xl font-bold">${accountInfo.totalEquity?.toFixed(2) || 0}</div>
                </div>
                <div>
                  <div className="text-xs text-dark-muted mb-1">可用</div>
                  <div className="text-xl font-bold text-green-500">${accountInfo.availableBalance?.toFixed(2) || 0}</div>
                </div>
                <div>
                  <div className="text-xs text-dark-muted mb-1">冻结</div>
                  <div className="text-xl font-bold text-orange-500">${accountInfo.usedMargin?.toFixed(2) || 0}</div>
                </div>
                <div>
                  <div className="text-xs text-dark-muted mb-1">账户类型</div>
                  <div className="text-sm font-bold uppercase">{accountInfo.accountType || 'SPOT'}</div>
                </div>
              </div>
            ) : (
              <div className="text-center text-dark-muted py-4">加载中...</div>
            )}
            
            {/* 多币种余额 */}
            {balance && balance.total && Object.keys(balance.total).length > 0 && (
              <div className="mt-4 pt-4 border-t border-dark-border">
                <div className="text-sm text-dark-muted mb-2">币种余额：</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Object.entries(balance.total)
                    .filter(([_, amount]) => amount > 0)
                    .map(([currency, amount]) => (
                      <div key={currency} className="bg-dark-bg p-2 rounded">
                        <div className="text-xs text-dark-muted">{currency}</div>
                        <div className="font-mono text-sm">{Number(amount).toFixed(6)}</div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
          
          {/* 下单表单 */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-500" />
              创建订单
            </h3>
            
            <form onSubmit={handleSubmitOrder} className="space-y-4">
              {/* 交易对 */}
              <div>
                <label className="block text-sm text-dark-muted mb-2">交易对</label>
                <select
                  value={orderForm.symbol}
                  onChange={(e) => {
                    setOrderForm({...orderForm, symbol: e.target.value});
                    fetchCurrentPrice();
                  }}
                  className="input w-full"
                >
                  <option value="BTC/USDT">BTC/USDT</option>
                  <option value="ETH/USDT">ETH/USDT</option>
                  <option value="BNB/USDT">BNB/USDT</option>
                  <option value="SOL/USDT">SOL/USDT</option>
                  <option value="XRP/USDT">XRP/USDT</option>
                  <option value="ADA/USDT">ADA/USDT</option>
                </select>
                {currentPrice && (
                  <div className="text-xs text-dark-muted mt-1">
                    当前价格: <span className="font-mono text-white">${currentPrice.toFixed(2)}</span>
                  </div>
                )}
              </div>
              
              {/* 方向 和 类型 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-dark-muted mb-2">方向</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrderForm({...orderForm, side: 'BUY'})}
                      className={`py-2 px-4 rounded font-medium transition-all ${
                        orderForm.side === 'BUY'
                          ? 'bg-green-500 text-white'
                          : 'bg-dark-bg text-dark-muted hover:bg-dark-border'
                      }`}
                    >
                      买入
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderForm({...orderForm, side: 'SELL'})}
                      className={`py-2 px-4 rounded font-medium transition-all ${
                        orderForm.side === 'SELL'
                          ? 'bg-red-500 text-white'
                          : 'bg-dark-bg text-dark-muted hover:bg-dark-border'
                      }`}
                    >
                      卖出
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm text-dark-muted mb-2">类型</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrderForm({...orderForm, type: 'LIMIT'})}
                      className={`py-2 px-4 rounded font-medium transition-all ${
                        orderForm.type === 'LIMIT'
                          ? 'bg-blue-500 text-white'
                          : 'bg-dark-bg text-dark-muted hover:bg-dark-border'
                      }`}
                    >
                      限价
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderForm({...orderForm, type: 'MARKET'})}
                      className={`py-2 px-4 rounded font-medium transition-all ${
                        orderForm.type === 'MARKET'
                          ? 'bg-blue-500 text-white'
                          : 'bg-dark-bg text-dark-muted hover:bg-dark-border'
                      }`}
                    >
                      市价
                    </button>
                  </div>
                </div>
              </div>
              
              {/* 价格（仅限价单） */}
              {orderForm.type === 'LIMIT' && (
                <div>
                  <label className="block text-sm text-dark-muted mb-2">价格 (USDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={orderForm.price}
                    onChange={(e) => setOrderForm({...orderForm, price: e.target.value})}
                    className="input w-full"
                    placeholder="输入价格"
                    required
                  />
                </div>
              )}
              
              {/* 数量 */}
              <div>
                <label className="block text-sm text-dark-muted mb-2">
                  数量
                  <span className="float-right text-xs">
                    可用: {getAvailableBalance().toFixed(2)} USDT
                  </span>
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={orderForm.amount}
                  onChange={(e) => setOrderForm({...orderForm, amount: e.target.value})}
                  className="input w-full"
                  placeholder="输入数量"
                  required
                />
                <div className="flex items-center justify-between mt-2">
                  <div className="text-xs text-dark-muted">
                    总计: <span className="font-mono text-white">{calculateTotal()} USDT</span>
                  </div>
                  <div className="flex space-x-2">
                    {[25, 50, 75, 100].map(percent => (
                      <button
                        key={percent}
                        type="button"
                        onClick={() => {
                          const available = getAvailableBalance();
                          const price = orderForm.type === 'MARKET' ? currentPrice : parseFloat(orderForm.price);
                          if (price) {
                            const amount = (available * percent / 100) / price;
                            setOrderForm({...orderForm, amount: amount.toFixed(6)});
                          }
                        }}
                        className="text-xs text-accent-primary hover:text-accent-primary/80"
                      >
                        {percent}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* 止损止盈 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-dark-muted mb-2 flex items-center">
                    <Shield className="w-3 h-3 mr-1" />
                    止损价 (可选)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={orderForm.stopLoss}
                    onChange={(e) => setOrderForm({...orderForm, stopLoss: e.target.value})}
                    className="input w-full"
                    placeholder="止损价格"
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-muted mb-2 flex items-center">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    止盈价 (可选)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={orderForm.takeProfit}
                    onChange={(e) => setOrderForm({...orderForm, takeProfit: e.target.value})}
                    className="input w-full"
                    placeholder="止盈价格"
                  />
                </div>
              </div>
              
              {/* 提交按钮 */}
              <button
                type="submit"
                disabled={loading}
                className={`btn w-full flex items-center justify-center space-x-2 ${
                  orderForm.side === 'BUY' 
                    ? 'bg-green-500 hover:bg-green-600' 
                    : 'bg-red-500 hover:bg-red-600'
                } text-white`}
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    {orderForm.side === 'BUY' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    <span>{orderForm.side === 'BUY' ? '买入' : '卖出'} {orderForm.symbol.split('/')[0]}</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
        
        {/* 右侧：未成交订单 */}
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center justify-between">
              <span className="flex items-center">
                <Settings className="w-5 h-5 mr-2 text-accent-primary" />
                未成交订单
              </span>
              <span className="text-sm text-dark-muted">({orders.length})</span>
            </h3>
            
            {orders.length > 0 ? (
              <div className="space-y-3">
                {orders.map(order => (
                  <div key={order.id} className="bg-dark-bg p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          order.side === 'BUY' 
                            ? 'bg-green-500/20 text-green-500'
                            : 'bg-red-500/20 text-red-500'
                        }`}>
                          {order.side}
                        </span>
                        <span className="font-bold">{order.symbol}</span>
                      </div>
                      <button
                        onClick={() => handleCancelOrder(order.id, order.symbol)}
                        className="text-dark-muted hover:text-red-500"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-dark-muted">价格</div>
                        <div className="font-mono">${Number(order.price || 0).toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-dark-muted">数量</div>
                        <div className="font-mono">{Number(order.amount || 0).toFixed(6)}</div>
                      </div>
                      <div>
                        <div className="text-dark-muted">已成交</div>
                        <div className="font-mono">{Number(order.filled || 0).toFixed(6)}</div>
                      </div>
                      <div>
                        <div className="text-dark-muted">状态</div>
                        <div className="text-yellow-500">{order.status}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-dark-muted">
                <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>暂无未成交订单</p>
              </div>
            )}
          </div>
          
          {/* 风险提示 */}
          {tradingMode === 'live' && (
            <div className="card bg-red-500/10 border-red-500">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-bold text-red-500 mb-1">风险警告</div>
                  <div className="text-dark-muted">
                    你正在使用真实资金交易。请确保：
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>已充分了解市场风险</li>
                      <li>已设置止损止盈</li>
                      <li>投入金额在承受范围内</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OKXTradingPanel;

