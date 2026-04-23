/**
 * 深度推理工具 (Reason Tool)
 * 用于复杂问题的深度思考和推理
 */

const BaseTool = require('./baseTool')
const aiService = require('../services/aiService')

class ReasonTool extends BaseTool {
  constructor() {
    super()
  }

  getDefinition() {
    return {
      name: 'reason',
      description: '对复杂问题进行深度推理和思考，适用于需要逻辑推理、数学推导或复杂分析的问题',
      parameters: [
        {
          name: 'problem',
          type: 'string',
          description: '需要推理的问题',
          required: true
        },
        {
          name: 'context',
          type: 'string',
          description: '相关上下文信息',
          required: false
        },
        {
          name: 'depth',
          type: 'string',
          description: '推理深度：shallow(浅层)、medium(中等)、deep(深层)',
          required: false,
          enum: ['shallow', 'medium', 'deep']
        }
      ]
    }
  }

  async execute(params) {
    const errors = this.validateParams(params)
    if (errors.length > 0) {
      throw new Error(`Parameter validation failed: ${errors.join(', ')}`)
    }

    const { problem, context = '', depth = 'medium' } = params

    try {
      const systemPrompt = this.getSystemPrompt(depth)
      const userPrompt = this.formatPrompt(problem, context)

      const response = await aiService.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        maxTokens: 2000
      })

      return {
        success: true,
        content: response.content,
        metadata: {
          depth,
          model: response.model,
          usage: response.usage
        }
      }
    } catch (error) {
      console.error('Reason tool execution failed:', error)
      return {
        success: false,
        content: `推理失败: ${error.message}`
      }
    }
  }

  getSystemPrompt(depth) {
    const basePrompt = `你是一个专业的推理助手，擅长逻辑推理、数学推导和复杂问题分析。
请按照以下步骤进行推理：
1. 理解问题的核心
2. 分析已知条件和约束
3. 制定推理策略
4. 逐步推理并验证
5. 得出结论并解释

请用清晰的思维过程展示推理步骤。`

    const depthPrompts = {
      shallow: `${basePrompt}\n\n请简洁地给出推理过程和结论。`,
      medium: `${basePrompt}\n\n请详细展示推理过程，包括中间步骤。`,
      deep: `${basePrompt}\n\n请非常详细地展示完整的推理过程，包括：
- 问题分解
- 假设验证
- 多种方法的尝试
- 详细的推导过程
- 结论的验证和推广`
    }

    return depthPrompts[depth] || depthPrompts.medium
  }

  formatPrompt(problem, context) {
    let prompt = `问题：${problem}`
    
    if (context) {
      prompt = `相关上下文：\n${context}\n\n${prompt}`
    }

    return prompt
  }
}

module.exports = ReasonTool
