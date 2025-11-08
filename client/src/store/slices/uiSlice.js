import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  activeTab: 'home',
  connected: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setActiveTab: (state, action) => {
      state.activeTab = action.payload;
    },
    setConnected: (state, action) => {
      state.connected = action.payload;
    },
    resetUI: (state) => {
      state.activeTab = 'home';
    },
  },
});

export const { setActiveTab, setConnected, resetUI } = uiSlice.actions;
export default uiSlice.reducer;
