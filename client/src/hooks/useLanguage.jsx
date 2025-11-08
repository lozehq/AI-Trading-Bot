import React, { createContext, useContext, useState } from 'react';
import { translations, DEFAULT_LANGUAGE } from '../i18n/translations';

// 语言上下文
const LanguageContext = createContext();

// 语言Provider
export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    // 从localStorage读取保存的语言设置
    return localStorage.getItem('app-language') || DEFAULT_LANGUAGE;
  });

  // 切换语言
  const toggleLanguage = () => {
    const newLang = language === 'zh' ? 'en' : 'zh';
    setLanguage(newLang);
    localStorage.setItem('app-language', newLang);
  };

  // 翻译函数
  const t = (key, params = {}) => {
    let text = translations[language]?.[key] || translations[DEFAULT_LANGUAGE]?.[key] || key;
    
    // 替换参数
    Object.keys(params).forEach(param => {
      text = text.replace(`{${param}}`, params[param]);
    });
    
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

// Hook: 使用语言
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}

