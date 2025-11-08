/**
 * 数据源配置管理
 * 负责数据源的配置加载、保存和切换
 */

const { getConfig, setConfig } = require('../../database/database');

class DataSourceConfig {
  constructor() {
    this.currentSource = 'ccxt';
    this.configLoaded = false;
  }

  /**
   * 从数据库加载配置（延迟加载）
   */
  loadConfig() {
    if (this.configLoaded) {
      return;
    }

    try {
      const config = getConfig('data_source');
      if (config) {
        this.currentSource = config;
        console.log(`📊 [数据源] 加载配置: ${this.currentSource.toUpperCase()}`);
      } else {
        console.log(`📊 [数据源] 使用默认配置: ${this.currentSource.toUpperCase()}`);
      }
      this.configLoaded = true;
    } catch (error) {
      console.warn('⚠️ [数据源] 加载配置失败，使用默认值:', error.message);
      this.configLoaded = true;
    }
  }

  /**
   * 确保配置已加载
   */
  ensureConfigLoaded() {
    if (!this.configLoaded) {
      this.loadConfig();
    }
  }

  /**
   * 保存配置到数据库
   */
  saveConfig() {
    try {
      setConfig('data_source', this.currentSource);
      console.log(`✅ [数据源] 配置已保存: ${this.currentSource.toUpperCase()}`);
    } catch (error) {
      console.error('❌ [数据源] 保存配置失败:', error.message);
    }
  }

  /**
   * 获取当前数据源
   */
  getCurrentSource() {
    this.ensureConfigLoaded();
    return this.currentSource;
  }

  /**
   * 设置当前数据源
   */
  setCurrentSource(source) {
    if (source !== 'mcp' && source !== 'ccxt') {
      throw new Error('无效的数据源，必须是 "mcp" 或 "ccxt"');
    }
    this.currentSource = source;
    this.saveConfig();
  }

  /**
   * 获取配置状态
   */
  getConfigStatus() {
    return {
      currentSource: this.currentSource,
      configLoaded: this.configLoaded,
      availableSources: ['ccxt', 'mcp']
    };
  }
}

module.exports = DataSourceConfig;
