/**
 * 事件总线 (EventBus)
 * 支持异步事件流，实现进度反馈
 */

class EventBus {
  constructor() {
    this.listeners = new Map()
    this.onceListeners = new Map()
  }

  /**
   * 注册事件监听器
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(callback)
  }

  /**
   * 注册一次性监听器
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  once(event, callback) {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, [])
    }
    this.onceListeners.get(event).push(callback)
  }

  /**
   * 触发事件
   * @param {string} event - 事件名
   * @param {any} data - 事件数据
   */
  emit(event, data) {
    const callbacks = this.listeners.get(event) || []
    callbacks.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`EventBus callback error for ${event}:`, error)
      }
    })

    const onceCallbacks = this.onceListeners.get(event) || []
    onceCallbacks.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`EventBus once callback error for ${event}:`, error)
      }
    })
    this.onceListeners.delete(event)
  }

  /**
   * 移除监听器
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数（可选）
   */
  off(event, callback) {
    if (!callback) {
      this.listeners.delete(event)
      this.onceListeners.delete(event)
      return
    }

    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event)
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }

    if (this.onceListeners.has(event)) {
      const callbacks = this.onceListeners.get(event)
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  /**
   * 清空所有监听器
   */
  clear() {
    this.listeners.clear()
    this.onceListeners.clear()
  }

  /**
   * 获取事件列表
   */
  getEvents() {
    return Array.from(new Set([
      ...this.listeners.keys(),
      ...this.onceListeners.keys()
    ]))
  }

  /**
   * 检查是否有监听器
   */
  hasListeners(event) {
    return this.listeners.has(event) || this.onceListeners.has(event)
  }
}

module.exports = EventBus
