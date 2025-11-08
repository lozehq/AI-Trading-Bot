import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  autoAIRunning: false,
  autoAIInterval: 120, // 默认2分钟
  autoAIAnalysis: null,
  autoAIThoughts: [],
  modelChatHistory: [],
};

const aiSlice = createSlice({
  name: 'ai',
  initialState,
  reducers: {
    setAutoAIRunning: (state, action) => {
      state.autoAIRunning = action.payload;
    },
    setAutoAIInterval: (state, action) => {
      state.autoAIInterval = action.payload;
    },
    setAutoAIAnalysis: (state, action) => {
      state.autoAIAnalysis = action.payload;
    },
    setAutoAIThoughts: (state, action) => {
      state.autoAIThoughts = action.payload;
    },
    addAutoAIThought: (state, action) => {
      state.autoAIThoughts.push(action.payload);
      // 只保留最近20条思考
      if (state.autoAIThoughts.length > 20) {
        state.autoAIThoughts.shift();
      }
    },
    clearAutoAIThoughts: (state) => {
      state.autoAIThoughts = [];
    },
    setModelChatHistory: (state, action) => {
      const value = action.payload;
      state.modelChatHistory = Array.isArray(value) ? value : [];
    },
    addChatMessage: (state, action) => {
      state.modelChatHistory.push(action.payload);
      // 只保留最近100条消息
      if (state.modelChatHistory.length > 100) {
        state.modelChatHistory.shift();
      }
    },
    clearChatHistory: (state) => {
      state.modelChatHistory = [];
    },
    resetAI: (state) => {
      state.autoAIRunning = false;
      state.autoAIAnalysis = null;
      state.autoAIThoughts = [];
    },
  },
});

export const {
  setAutoAIRunning,
  setAutoAIInterval,
  setAutoAIAnalysis,
  setAutoAIThoughts,
  addAutoAIThought,
  clearAutoAIThoughts,
  setModelChatHistory,
  addChatMessage,
  clearChatHistory,
  resetAI,
} = aiSlice.actions;
export default aiSlice.reducer;
