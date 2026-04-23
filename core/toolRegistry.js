/**
 * 工具注册中心 (ToolRegistry)
 * 管理和调度所有工具
 */

const BaseTool = require('../tools/baseTool')

class ToolRegistry {
  constructor() {
    this.tools = new Map()
  }

  /**
   * 加载所有工具
   */
  async loadTools() {
    const tools = [
      require('../tools/ragTool'),
      require('../tools/reasonTool'),
      require('../tools/webSearchTool')
    ]

    for (const ToolClass of tools) {
      try {
        const tool = new ToolClass()
        this.register(tool)
      } catch (error) {
        console.error(`Failed to load tool:`, error)
      }
    }
  }

  /**
   * 注册工具
   * @param {BaseTool} tool - 工具实例
   */
  register(tool) {
    if (!(tool instanceof BaseTool)) {
      throw new Error('Tool must extend BaseTool')
    }

    const definition = tool.getDefinition()
    this.tools.set(definition.name, tool)
  }

  /**
   * 获取工具
   * @param {string} name - 工具名
   */
  get(name) {
    return this.tools.get(name)
  }

  /**
   * 执行工具
   * @param {string} toolName - 工具名
   * @param {Object} params - 参数
   * @param {EventBus} eventBus - 事件总线
   */
  async executeTool(toolName, params, eventBus) {
    const tool = this.tools.get(toolName)
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`)
    }

    eventBus.emit('tool:start', { tool: toolName, params })

    try {
      const result = await tool.execute(params)
      eventBus.emit('tool:complete', { tool: toolName, result })
      return result
    } catch (error) {
      eventBus.emit('tool:error', { tool: toolName, error: error.message })
      throw error
    }
  }

  /**
   * 获取所有工具定义
   */
  getDefinitions() {
    const definitions = []
    for (const tool of this.tools.values()) {
      definitions.push(tool.getDefinition())
    }
    return definitions
  }

  /**
   * 获取工具名列表
   */
  getToolNames() {
    return Array.from(this.tools.keys())
  }

  /**
   * 检查工具是否存在
   */
  has(name) {
    return this.tools.has(name)
  }
}

module.exports = ToolRegistry
