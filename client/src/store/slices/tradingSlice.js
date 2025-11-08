import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  autoTradingEnabled: false,
  selectedSymbol: 'ETH/USDT',
};

const tradingSlice = createSlice({
  name: 'trading',
  initialState,
  reducers: {
    toggleAutoTrading: (state) => {
      state.autoTradingEnabled = !state.autoTradingEnabled;
    },
    setAutoTradingEnabled: (state, action) => {
      state.autoTradingEnabled = action.payload;
    },
    setSelectedSymbol: (state, action) => {
      state.selectedSymbol = action.payload;
    },
    resetTrading: (state) => {
      state.autoTradingEnabled = false;
    },
  },
});

export const {
  toggleAutoTrading,
  setAutoTradingEnabled,
  setSelectedSymbol,
  resetTrading,
} = tradingSlice.actions;
export default tradingSlice.reducer;
