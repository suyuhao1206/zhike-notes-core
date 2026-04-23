/**
 * 能力注册中心 (CapabilityRegistry)
 * 管理和调度所有能力
 */

const BaseCapability = require('../capabilities/baseCapability')

class CapabilityRegistry {
  constructor() {
    this.capabilities = new Map()
  }

  /**
   * 加载所有能力
   */
  async loadCapabilities() {
    const capabilities = [
      require('../capabilities/chatCapability'),
      require('../capabilities/deepSolveCapability'),
      require('../capabilities/quizGenCapability')
    ]

    for (const CapabilityClass of capabilities) {
      try {
        const capability = new CapabilityClass()
        this.register(capability)
      } catch (error) {
        console.error(`Failed to load capability:`, error)
      }
    }
  }

  /**
   * 注册能力
   * @param {BaseCapability} capability - 能力实例
   */
  register(capability) {
    if (!(capability instanceof BaseCapability)) {
      throw new Error('Capability must extend BaseCapability')
    }

    const manifest = capability.getManifest()
    this.capabilities.set(manifest.name, capability)
  }

  /**
   * 获取能力
   * @param {string} name - 能力名
   */
  get(name) {
    return this.capabilities.get(name)
  }

  /**
   * 执行能力
   * @param {UnifiedContext} context - 统一上下文
   * @param {EventBus} eventBus - 事件总线
   */
  async execute(context, eventBus) {
    const capabilityName = context.activeCapability || 'chat'
    const capability = this.capabilities.get(capabilityName)
    
    if (!capability) {
      throw new Error(`Capability not found: ${capabilityName}`)
    }

    eventBus.emit('capability:start', { capability: capabilityName })

    try {
      const result = await capability.run(context, eventBus)
      eventBus.emit('capability:complete', { capability: capabilityName, result })
      return result
    } catch (error) {
      eventBus.emit('capability:error', { 
        capability: capabilityName, 
        error: error.message 
      })
      throw error
    }
  }

  /**
   * 获取所有能力定义
   */
  getManifests() {
    const manifests = []
    for (const capability of this.capabilities.values()) {
      manifests.push(capability.getManifest())
    }
    return manifests
  }

  /**
   * 获取能力名列表
   */
  getCapabilityNames() {
    return Array.from(this.capabilities.keys())
  }

  /**
   * 检查能力是否存在
   */
  has(name) {
    return this.capabilities.has(name)
  }
}

module.exports = CapabilityRegistry
