import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  marketData: null,
  tradeSignals: [],
};

const marketSlice = createSlice({
  name: 'market',
  initialState,
  reducers: {
    setMarketData: (state, action) => {
      state.marketData = action.payload;
    },
    addTradeSignal: (state, action) => {
      state.tradeSignals.unshift(action.payload);
      // 只保留最近10条信号
      if (state.tradeSignals.length > 10) {
        state.tradeSignals.pop();
      }
    },
    clearTradeSignals: (state) => {
      state.tradeSignals = [];
    },
    resetMarket: (state) => {
      state.marketData = null;
      state.tradeSignals = [];
    },
  },
});

export const {
  setMarketData,
  addTradeSignal,
  clearTradeSignals,
  resetMarket,
} = marketSlice.actions;
export default marketSlice.reducer;
