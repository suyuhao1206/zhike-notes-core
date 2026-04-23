/**
 * 工具基类 (BaseTool)
 * 所有工具必须继承此类
 */

class BaseTool {
  constructor() {
    if (new.target === BaseTool) {
      throw new Error('BaseTool is abstract and cannot be instantiated directly')
    }
  }

  /**
   * 获取工具定义
   * 必须在子类中实现
   */
  getDefinition() {
    throw new Error('Must implement getDefinition()')
  }

  /**
   * 执行工具
   * 必须在子类中实现
   * @param {Object} params - 工具参数
   * @returns {Promise<Object>} 工具结果
   */
  async execute(params) {
    throw new Error('Must implement execute()')
  }

  /**
   * 获取工具名称
   */
  get name() {
    return this.getDefinition().name
  }

  /**
   * 验证参数
   */
  validateParams(params) {
    const definition = this.getDefinition()
    const errors = []

    for (const param of definition.parameters) {
      if (param.required && !(param.name in params)) {
        errors.push(`Missing required parameter: ${param.name}`)
      }

      if (param.name in params) {
        const value = params[param.name]
        const type = typeof value

        if (param.type === 'string' && type !== 'string') {
          errors.push(`Parameter ${param.name} must be string, got ${type}`)
        } else if (param.type === 'number' && type !== 'number') {
          errors.push(`Parameter ${param.name} must be number, got ${type}`)
        } else if (param.type === 'boolean' && type !== 'boolean') {
          errors.push(`Parameter ${param.name} must be boolean, got ${type}`)
        } else if (param.type === 'array' && !Array.isArray(value)) {
          errors.push(`Parameter ${param.name} must be array`)
        } else if (param.type === 'object' && (type !== 'object' || Array.isArray(value))) {
          errors.push(`Parameter ${param.name} must be object`)
        }

        if (param.enum && !param.enum.includes(value)) {
          errors.push(`Parameter ${param.name} must be one of: ${param.enum.join(', ')}`)
        }
      }
    }

    return errors
  }

  /**
   * 转换为OpenAI函数调用格式
   */
  toOpenAISchema() {
    const definition = this.getDefinition()
    const properties = {}
    const required = []

    for (const param of definition.parameters) {
      properties[param.name] = {
        type: param.type,
        description: param.description || ''
      }

      if (param.enum) {
        properties[param.name].enum = param.enum
      }

      if (param.required) {
        required.push(param.name)
      }
    }

    return {
      type: 'function',
      function: {
        name: definition.name,
        description: definition.description,
        parameters: {
          type: 'object',
          properties,
          required
        }
      }
    }
  }
}

module.exports = BaseTool
