import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Wifi, Globe } from 'lucide-react';

/**
 * VPN/魔法上网警告弹窗
 * 提示用户需要使用魔法上网才能访问 OKX 等接口
 */
const VPNWarningModal = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // 检查是否永久关闭
    const isPermanentlyClosed = localStorage.getItem('vpn_warning_permanently_closed');
    
    if (!isPermanentlyClosed) {
      // 延迟500ms显示，让页面先加载
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = (permanent = false) => {
    setIsClosing(true);
    
    if (permanent) {
      localStorage.setItem('vpn_warning_permanently_closed', 'true');
    }
    
    // 动画结束后隐藏
    setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
    }, 300);
  };

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={() => handleClose(false)}
    >
      <div 
        className={`relative bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-yellow-500/50 rounded-2xl shadow-2xl max-w-md w-full mx-4 transform transition-all duration-300 ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={() => handleClose(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        {/* 头部 */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-yellow-500/20 rounded-full">
              <AlertTriangle className="text-yellow-500" size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">重要提示</h2>
              <p className="text-sm text-gray-400">Important Notice</p>
            </div>
          </div>
        </div>

        {/* 内容 */}
        <div className="px-6 pb-6 space-y-4">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="flex items-start gap-3">
              <Wifi className="text-blue-400 mt-1 flex-shrink-0" size={20} />
              <div>
                <h3 className="text-white font-semibold mb-2">需要魔法上网</h3>
                <p className="text-gray-300 text-sm leading-relaxed">
                  本项目使用的数据接口（OKX、Binance等）在部分地区受到网络限制，
                  <span className="text-yellow-400 font-medium">需要使用 VPN 或代理工具</span>
                  才能正常访问。
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="flex items-start gap-3">
              <Globe className="text-green-400 mt-1 flex-shrink-0" size={20} />
              <div>
                <h3 className="text-white font-semibold mb-2">受影响的功能</h3>
                <ul className="text-gray-300 text-sm space-y-1">
                  <li>• OKX 交易所数据获取</li>
                  <li>• Binance 市场数据</li>
                  <li>• CoinGecko 行情信息</li>
                  <li>• 实时价格推送</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-blue-300 text-xs text-center">
              如果您已经启用了魔法上网，请忽略此提示
            </p>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={() => handleClose(false)}
            className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
          >
            我知道了
          </button>
          <button
            onClick={() => handleClose(true)}
            className="flex-1 px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-gray-900 rounded-lg font-medium transition-colors"
          >
            不再提示
          </button>
        </div>

        {/* 装饰性元素 */}
        <div className="absolute -top-1 -right-1 w-20 h-20 bg-yellow-500/20 rounded-full blur-2xl"></div>
        <div className="absolute -bottom-1 -left-1 w-20 h-20 bg-blue-500/20 rounded-full blur-2xl"></div>
      </div>
    </div>
  );
};

export default VPNWarningModal;

