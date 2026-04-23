// 全局工具函数

/**
 * 格式化日期时间
 * @param {Date|string|number} date - 日期对象、字符串或时间戳
 * @param {string} format - 格式化模板，默认 'YYYY-MM-DD HH:mm'
 * @returns {string} 格式化后的字符串
 */
function formatDateTime(date, format = 'YYYY-MM-DD HH:mm') {
  if (!date) return '';

  const d = typeof date === 'object' ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 格式化持续时间（秒 -> 可读字符串）
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的字符串，如 "1小时30分钟"
 */
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0秒';

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}小时`);
  if (mins > 0) parts.push(`${mins}分钟`);
  if (secs > 0 && hours === 0) parts.push(`${secs}秒`);

  return parts.length > 0 ? parts.join('') : '0秒';
}

/**
 * 格式化时间（秒 -> MM:SS）
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的字符串，如 "05:30"
 */
function formatTimeMMSS(seconds) {
  if (!seconds || seconds < 0) return '00:00';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * 获取相对时间描述
 * @param {Date|string|number} date - 日期
 * @returns {string} 相对时间，如 "3分钟前"
 */
function getRelativeTime(date) {
  if (!date) return '';

  const d = typeof date === 'object' ? date : new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;
  if (diff < week) return `${Math.floor(diff / day)}天前`;

  return formatDateTime(d, 'MM-DD');
}

/**
 * 防抖函数
 * @param {Function} fn - 要执行的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function}
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * 节流函数
 * @param {Function} fn - 要执行的函数
 * @param {number} interval - 间隔时间（毫秒）
 * @returns {Function}
 */
function throttle(fn, interval = 300) {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}

/**
 * 显示加载提示
 * @param {string} title - 提示文字
 * @param {boolean} mask - 是否显示遮罩
 */
function showLoading(title = '加载中...', mask = true) {
  wx.showLoading({ title, mask });
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
  wx.hideLoading();
}

/**
 * 显示成功提示
 * @param {string} title - 提示文字
 * @param {Function} callback - 回调函数
 */
function showSuccess(title = '操作成功', callback) {
  wx.showToast({
    title,
    icon: 'success',
    success: callback
  });
}

/**
 * 显示错误提示
 * @param {string} title - 提示文字
 */
function showError(title = '操作失败') {
  wx.showToast({
    title,
    icon: 'error'
  });
}

/**
 * 显示普通提示
 * @param {string} title - 提示文字
 */
function showToast(title) {
  wx.showToast({
    title,
    icon: 'none'
  });
}

/**
 * 显示弹窗
 * @param {string} title - 标题
 * @param {string} content - 内容
 * @param {Function} callback - 点击确认后的回调
 */
function showModal(title, content, callback) {
  wx.showModal({
    title,
    content,
    showCancel: false,
    success: () => {
      if (typeof callback === 'function') callback();
    }
  });
}

/**
 * 确认对话框
 * @param {string} content - 提示内容
 * @param {string} title - 标题
 * @returns {Promise<boolean>}
 */
function confirm(content, title = '提示') {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success: (res) => resolve(res.confirm)
    });
  });
}

/**
 * 复制到剪贴板
 * @param {string} data - 要复制的文本
 * @returns {Promise<boolean>}
 */
function copyToClipboard(data) {
  return new Promise((resolve) => {
    wx.setClipboardData({
      data,
      success: () => {
        showToast('已复制到剪贴板');
        resolve(true);
      },
      fail: () => {
        showError('复制失败');
        resolve(false);
      }
    });
  });
}

/**
 * 保存数据到本地存储
 * @param {string} key - 键名
 * @param {any} data - 数据
 */
function setStorage(key, data) {
  try {
    wx.setStorageSync(key, data);
  } catch (e) {
    console.error('保存数据失败:', e);
  }
}

/**
 * 从本地存储获取数据
 * @param {string} key - 键名
 * @param {any} defaultValue - 默认值
 * @returns {any}
 */
function getStorage(key, defaultValue = null) {
  try {
    const value = wx.getStorageSync(key);
    return value === undefined || value === null ? defaultValue : value;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * 从本地存储删除数据
 * @param {string} key - 键名
 */
function removeStorage(key) {
  try {
    wx.removeStorageSync(key);
  } catch (e) {
    console.error('删除数据失败:', e);
  }
}

/**
 * 生成唯一ID
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 截断文本
 * @param {string} text - 原文本
 * @param {number} maxLength - 最大长度
 * @param {string} suffix - 后缀
 * @returns {string}
 */
function truncateText(text, maxLength = 100, suffix = '...') {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + suffix;
}

/**
 * 提取纯文本（去除HTML标签）
 * @param {string} html - HTML字符串
 * @returns {string}
 */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '');
}

module.exports = {
  formatDateTime,
  formatDuration,
  formatTimeMMSS,
  getRelativeTime,
  debounce,
  throttle,
  showLoading,
  hideLoading,
  showSuccess,
  showError,
  showToast,
  showModal,
  confirm,
  copyToClipboard,
  setStorage,
  getStorage,
  removeStorage,
  generateId,
  truncateText,
  stripHtml
};
