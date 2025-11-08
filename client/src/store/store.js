import { configureStore } from '@reduxjs/toolkit';
import uiReducer from './slices/uiSlice';
import tradingReducer from './slices/tradingSlice';
import aiReducer from './slices/aiSlice';
import marketReducer from './slices/marketSlice';

export const store = configureStore({
  reducer: {
    ui: uiReducer,
    trading: tradingReducer,
    ai: aiReducer,
    market: marketReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // 开发环境关闭可序列化检查以避免大型对象导致的性能警告
      serializableCheck: false,
      // 保留不可变性检查，但提高警告阈值
      immutableCheck: { warnAfter: 64 },
    }),
});

export default store;
