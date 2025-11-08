import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { LanguageProvider } from './hooks/useLanguage.jsx';
import { Provider } from 'react-redux';
import store from './store/store';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ToastPortal from './components/ToastPortal.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  // 临时移除 StrictMode 以避免开发环境的双重渲染导致请求风暴
  // 生产构建不受影响
  // <React.StrictMode>
    <Provider store={store}>
      <LanguageProvider>
        <ErrorBoundary>
          <App />
          {/** 全局Toast */}
          <ToastPortal />
        </ErrorBoundary>
      </LanguageProvider>
    </Provider>
  // </React.StrictMode>
);

