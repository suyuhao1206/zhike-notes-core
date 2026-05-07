/**
 * 编排器 (Orchestrator)
 * 统一入口，路由请求到对应的工具或能力
 */

const EventBus = require('./eventBus')
const ToolRegistry = require('./toolRegistry')
const CapabilityRegistry = require('./capabilityRegistry')

class Orchestrator {
  constructor() {
    this.eventBus = new EventBus()
    this.toolRegistry = new ToolRegistry()
    this.capabilityRegistry = new CapabilityRegistry()
    this.initialized = false
  }

  /**
   * 初始化编排器
   */
  async init() {
    if (this.initialized) return

    await this.toolRegistry.loadTools()
    await this.capabilityRegistry.loadCapabilities()
    
    this.initialized = true
  }

  /**
   * 处理用户请求
   * @param {UnifiedContext} context - 统一上下文
   * @returns {Promise<Object>} 处理结果
   */
  async processRequest(context) {
    if (!this.initialized) {
      await this.init()
    }

    try {
      this.eventBus.emit('request:start', {
        sessionId: context.sessionId,
        message: context.userMessage
      })

      let result

      if (context.activeCapability) {
        result = await this.capabilityRegistry.execute(context, this.eventBus)
      } else {
        result = await this.toolRegistry.execute(context, this.eventBus)
      }

      this.eventBus.emit('request:complete', {
        sessionId: context.sessionId,
        result
      })

      return result

    } catch (error) {
      this.eventBus.emit('request:error', {
        sessionId: context.sessionId,
        error: error.message
      })

      throw error
    }
  }

  /**
   * 注册事件监听器
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  on(event, callback) {
    this.eventBus.on(event, callback)
  }

  /**
   * 获取可用的工具列表
   */
  getAvailableTools() {
    return this.toolRegistry.getToolNames()
  }

  /**
   * 获取可用的能力列表
   */
  getAvailableCapabilities() {
    return this.capabilityRegistry.getCapabilityNames()
  }
}

let instance = null

function getOrchestrator() {
  if (!instance) {
    instance = new Orchestrator()
  }
  return instance
}

module.exports = {
  Orchestrator,
  getOrchestrator
}
