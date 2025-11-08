/**
 * 安全数字处理工具
 * 防止NaN、Infinity和无效数字在系统中传播
 */

class SafeNumber {
  /**
   * 安全解析浮点数
   * @param {any} value - 输入值
   * @param {number} defaultValue - 默认值
   * @returns {number} 安全的数字
   */
  static parseFloat(value, defaultValue = 0) {
    if (value === null || value === undefined) {
      return defaultValue;
    }

    const parsed = parseFloat(value);

    if (isNaN(parsed) || !isFinite(parsed)) {
      console.warn(`[SafeNumber] 无效数字: ${value}, 使用默认值: ${defaultValue}`);
      return defaultValue;
    }

    return parsed;
  }

  /**
   * 安全解析整数
   * @param {any} value - 输入值
   * @param {number} defaultValue - 默认值
   * @returns {number} 安全的整数
   */
  static parseInt(value, defaultValue = 0) {
    if (value === null || value === undefined) {
      return defaultValue;
    }

    const parsed = parseInt(value, 10);

    if (isNaN(parsed) || !isFinite(parsed)) {
      console.warn(`[SafeNumber] 无效整数: ${value}, 使用默认值: ${defaultValue}`);
      return defaultValue;
    }

    return parsed;
  }

  /**
   * 安全除法
   * @param {number} dividend - 被除数
   * @param {number} divisor - 除数
   * @param {number} defaultValue - 除数为0时的默认值
   * @returns {number} 安全的商
   */
  static divide(dividend, divisor, defaultValue = 0) {
    const safeDividend = this.parseFloat(dividend, 0);
    const safeDivisor = this.parseFloat(divisor, 0);

    if (safeDivisor === 0) {
      return defaultValue;
    }

    const result = safeDividend / safeDivisor;

    if (!isFinite(result)) {
      return defaultValue;
    }

    return result;
  }

  /**
   * 安全乘法
   * @param {number} a - 乘数1
   * @param {number} b - 乘数2
   * @param {number} defaultValue - 异常时的默认值
   * @returns {number} 安全的积
   */
  static multiply(a, b, defaultValue = 0) {
    const safeA = this.parseFloat(a, 0);
    const safeB = this.parseFloat(b, 0);

    const result = safeA * safeB;

    if (!isFinite(result)) {
      return defaultValue;
    }

    return result;
  }

  /**
   * 安全百分比计算
   * @param {number} value - 值
   * @param {number} total - 总数
   * @param {number} precision - 小数位数
   * @returns {number} 百分比
   */
  static percentage(value, total, precision = 2) {
    const percentage = this.divide(value, total, 0) * 100;
    return this.round(percentage, precision);
  }

  /**
   * 安全四舍五入
   * @param {number} value - 数值
   * @param {number} precision - 小数位数
   * @returns {number} 四舍五入后的数值
   */
  static round(value, precision = 2) {
    const safeValue = this.parseFloat(value, 0);
    const multiplier = Math.pow(10, precision);
    return Math.round(safeValue * multiplier) / multiplier;
  }

  /**
   * 验证是否为有效数字
   * @param {any} value - 待验证的值
   * @returns {boolean} 是否为有效数字
   */
  static isValid(value) {
    if (value === null || value === undefined) {
      return false;
    }
    const num = parseFloat(value);
    return !isNaN(num) && isFinite(num);
  }

  /**
   * 限制数值范围
   * @param {number} value - 数值
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {number} 限制后的数值
   */
  static clamp(value, min, max) {
    const safeValue = this.parseFloat(value, min);
    return Math.max(min, Math.min(max, safeValue));
  }

  /**
   * 安全求和
   * @param {Array<number>} numbers - 数字数组
   * @returns {number} 和
   */
  static sum(numbers) {
    if (!Array.isArray(numbers)) {
      return 0;
    }

    return numbers.reduce((acc, num) => {
      const safeNum = this.parseFloat(num, 0);
      return acc + safeNum;
    }, 0);
  }

  /**
   * 安全平均值
   * @param {Array<number>} numbers - 数字数组
   * @returns {number} 平均值
   */
  static average(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return 0;
    }

    const sum = this.sum(numbers);
    return this.divide(sum, numbers.length, 0);
  }

  /**
   * 格式化数字显示
   * @param {number} value - 数值
   * @param {object} options - 格式化选项
   * @returns {string} 格式化后的字符串
   */
  static format(value, options = {}) {
    const {
      precision = 2,
      prefix = '',
      suffix = '',
      thousandsSeparator = ','
    } = options;

    const safeValue = this.parseFloat(value, 0);
    const fixed = safeValue.toFixed(precision);

    // 添加千位分隔符
    const parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);

    return prefix + parts.join('.') + suffix;
  }

  /**
   * 安全的数学运算链
   * @param {number} initialValue - 初始值
   * @returns {object} 链式运算对象
   */
  static chain(initialValue) {
    let value = this.parseFloat(initialValue, 0);

    return {
      add: (n) => {
        value = value + this.parseFloat(n, 0);
        return this.chain(value);
      },
      subtract: (n) => {
        value = value - this.parseFloat(n, 0);
        return this.chain(value);
      },
      multiply: (n) => {
        value = this.multiply(value, n);
        return this.chain(value);
      },
      divide: (n) => {
        value = this.divide(value, n);
        return this.chain(value);
      },
      round: (precision) => {
        value = this.round(value, precision);
        return this.chain(value);
      },
      clamp: (min, max) => {
        value = this.clamp(value, min, max);
        return this.chain(value);
      },
      value: () => value
    };
  }
}

module.exports = SafeNumber;