import { useDispatch, useSelector } from 'react-redux';
import {
  setActiveTab,
  setConnected,
} from '../store/slices/uiSlice';
import {
  toggleAutoTrading,
  setAutoTradingEnabled,
  setSelectedSymbol,
} from '../store/slices/tradingSlice';
import {
  setAutoAIRunning,
  setAutoAIInterval,
  setAutoAIAnalysis,
  setAutoAIThoughts,
  addAutoAIThought,
  clearAutoAIThoughts,
  setModelChatHistory,
  addChatMessage,
  clearChatHistory,
} from '../store/slices/aiSlice';
import {
  setMarketData,
  addTradeSignal,
} from '../store/slices/marketSlice';

// UI相关hooks
export const useUI = () => {
  const dispatch = useDispatch();
  const activeTab = useSelector((state) => state.ui.activeTab);
  const connected = useSelector((state) => state.ui.connected);

  return {
    activeTab,
    connected,
    setActiveTab: (tab) => dispatch(setActiveTab(tab)),
    setConnected: (status) => dispatch(setConnected(status)),
  };
};

// 交易相关hooks
export const useTrading = () => {
  const dispatch = useDispatch();
  const autoTradingEnabled = useSelector((state) => state.trading.autoTradingEnabled);
  const selectedSymbol = useSelector((state) => state.trading.selectedSymbol);

  return {
    autoTradingEnabled,
    selectedSymbol,
    toggleAutoTrading: () => dispatch(toggleAutoTrading()),
    setAutoTradingEnabled: (enabled) => dispatch(setAutoTradingEnabled(enabled)),
    setSelectedSymbol: (symbol) => dispatch(setSelectedSymbol(symbol)),
  };
};

// AI相关hooks
export const useAI = () => {
  const dispatch = useDispatch();
  const autoAIRunning = useSelector((state) => state.ai.autoAIRunning);
  const autoAIInterval = useSelector((state) => state.ai.autoAIInterval);
  const autoAIAnalysis = useSelector((state) => state.ai.autoAIAnalysis);
  const autoAIThoughts = useSelector((state) => state.ai.autoAIThoughts);
  const modelChatHistory = useSelector((state) => state.ai.modelChatHistory);

  return {
    autoAIRunning,
    autoAIInterval,
    autoAIAnalysis,
    autoAIThoughts,
    modelChatHistory,
    setAutoAIRunning: (running) => dispatch(setAutoAIRunning(running)),
    setAutoAIInterval: (interval) => dispatch(setAutoAIInterval(interval)),
    setAutoAIAnalysis: (analysis) => dispatch(setAutoAIAnalysis(analysis)),
    setAutoAIThoughts: (thoughts) => dispatch(setAutoAIThoughts(thoughts)),
    addAutoAIThought: (thought) => dispatch(addAutoAIThought(thought)),
    clearAutoAIThoughts: () => dispatch(clearAutoAIThoughts()),
    // 允许传入函数式更新器，内部安全展开为数组，避免把函数放进Redux
    setModelChatHistory: (updater) => {
      if (typeof updater === 'function') {
        const prev = Array.isArray(modelChatHistory) ? modelChatHistory : [];
        const next = updater(prev);
        dispatch(setModelChatHistory(Array.isArray(next) ? next : prev));
      } else {
        dispatch(setModelChatHistory(Array.isArray(updater) ? updater : []));
      }
    },
    addChatMessage: (message) => dispatch(addChatMessage(message)),
    clearChatHistory: () => dispatch(clearChatHistory()),
  };
};

// 市场数据相关hooks
export const useMarket = () => {
  const dispatch = useDispatch();
  const marketData = useSelector((state) => state.market.marketData);
  const tradeSignals = useSelector((state) => state.market.tradeSignals);

  return {
    marketData,
    tradeSignals,
    setMarketData: (data) => dispatch(setMarketData(data)),
    addTradeSignal: (signal) => dispatch(addTradeSignal(signal)),
  };
};
