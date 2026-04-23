/**
 * 能力基类 (BaseCapability)
 * 所有能力必须继承此类
 */

class BaseCapability {
  constructor() {
    if (new.target === BaseCapability) {
      throw new Error('BaseCapability is abstract and cannot be instantiated directly')
    }
  }

  /**
   * 获取能力清单
   * 必须在子类中实现
   */
  getManifest() {
    throw new Error('Must implement getManifest()')
  }

  /**
   * 执行能力
   * 必须在子类中实现
   * @param {UnifiedContext} context - 统一上下文
   * @param {EventBus} eventBus - 事件总线
   * @returns {Promise<Object>} 执行结果
   */
  async run(context, eventBus) {
    throw new Error('Must implement run()')
  }

  /**
   * 获取能力名称
   */
  get name() {
    return this.getManifest().name
  }

  /**
   * 获取阶段列表
   */
  get stages() {
    return this.getManifest().stages
  }

  /**
   * 发送阶段事件
   */
  emitStage(eventBus, stage, message, data = {}) {
    eventBus.emit('stage', {
      capability: this.name,
      stage,
      message,
      ...data
    })
  }

  /**
   * 发送进度事件
   */
  emitProgress(eventBus, progress, message) {
    eventBus.emit('progress', {
      capability: this.name,
      progress,
      message
    })
  }

  /**
   * 发送内容事件
   */
  emitContent(eventBus, content) {
    eventBus.emit('content', {
      capability: this.name,
      content
    })
  }

  /**
   * 发送错误事件
   */
  emitError(eventBus, error) {
    eventBus.emit('error', {
      capability: this.name,
      error: error.message || error
    })
  }
}

module.exports = BaseCapability
