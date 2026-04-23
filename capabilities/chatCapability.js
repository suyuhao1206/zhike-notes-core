/**
 * Chat能力 (Chat Capability)
 * 工具增强的对话能力，支持RAG、推理等工具调用
 */

const BaseCapability = require('./baseCapability')
const aiService = require('../services/aiService')

class ChatCapability extends BaseCapability {
  getManifest() {
    return {
      name: 'chat',
      description: '工具增强的智能对话，支持RAG检索、深度推理等多种工具',
      stages: ['understanding', 'tool_calling', 'reasoning', 'responding'],
      toolsUsed: ['rag', 'reason', 'web_search'],
      cliAliases: ['chat', 'c'],
      configDefaults: {
        temperature: 0.7,
        maxTokens: 2000
      }
    }
  }

  async run(context, eventBus) {
    try {
      this.emitStage(eventBus, 'understanding', '理解问题中...')
      
      const understanding = await this.understandQuestion(context)
      
      const toolResults = await this.callToolsIfNeeded(context, eventBus, understanding)
      
      this.emitStage(eventBus, 'reasoning', '思考中...')
      
      const reasoning = await this.reason(context, toolResults)
      
      this.emitStage(eventBus, 'responding', '生成回答...')
      
      const response = await this.generateResponse(context, reasoning, toolResults)
      
      context.addToHistory('assistant', response)
      
      return {
        success: true,
        content: response,
        metadata: {
          toolsUsed: toolResults.map(r => r.tool),
          understanding: understanding.summary
        }
      }
    } catch (error) {
      this.emitError(eventBus, error)
      throw error
    }
  }

  async understandQuestion(context) {
    const { userMessage, notebookContext } = context
    
    const understanding = {
      original: userMessage,
      summary: userMessage,
      intent: 'general',
      needRAG: false,
      needReasoning: false
    }
    
    if (this.containsKeywords(userMessage, ['笔记', '讲义', '课件', '课堂'])) {
      understanding.needRAG = true
      understanding.intent = 'knowledge_query'
    }
    
    if (this.containsKeywords(userMessage, ['为什么', '怎么推导', '证明', '解释'])) {
      understanding.needReasoning = true
      understanding.intent = 'explanation'
    }
    
    if (this.containsKeywords(userMessage, ['计算', '求解', '求值', '求积分', '求导数'])) {
      understanding.needReasoning = true
      understanding.intent = 'problem_solving'
    }
    
    if (notebookContext) {
      understanding.needRAG = true
    }
    
    return understanding
  }

  containsKeywords(text, keywords) {
    return keywords.some(keyword => text.includes(keyword))
  }

  async callToolsIfNeeded(context, eventBus, understanding) {
    const results = []
    const { enabledTools } = context
    
    if (!enabledTools || enabledTools.length === 0) {
      return results
    }
    
    if (understanding.needRAG && enabledTools.includes('rag')) {
      this.emitStage(eventBus, 'tool_calling', '从知识库检索信息...')
      
      const ragTool = require('../tools/ragTool')
      const tool = new ragTool()
      
      const result = await tool.execute({
        query: context.userMessage,
        knowledgeBase: context.knowledgeBases[0],
        topK: 5
      })
      
      results.push({
        tool: 'rag',
        result
      })
      
      this.emitContent(eventBus, `检索到 ${result.sources.length} 条相关信息`)
    }
    
    if (understanding.needReasoning && enabledTools.includes('reason')) {
      this.emitStage(eventBus, 'tool_calling', '深度推理中...')
      
      const reasonTool = require('../tools/reasonTool')
      const tool = new reasonTool()
      
      const ragContext = results.find(r => r.tool === 'rag')?.result?.content || ''
      
      const result = await tool.execute({
        problem: context.userMessage,
        context: ragContext,
        depth: 'medium'
      })
      
      results.push({
        tool: 'reason',
        result
      })
    }
    
    return results
  }

  async reason(context, toolResults) {
    const ragResult = toolResults.find(r => r.tool === 'rag')?.result
    const reasonResult = toolResults.find(r => r.tool === 'reason')?.result
    
    const parts = []
    
    if (ragResult && ragResult.success) {
      parts.push(`参考信息：\n${ragResult.content}`)
    }
    
    if (reasonResult && reasonResult.success) {
      parts.push(`推理过程：\n${reasonResult.content}`)
    }
    
    return parts.join('\n\n')
  }

  async generateResponse(context, reasoning, toolResults) {
    const messages = []
    
    messages.push({
      role: 'system',
      content: this.getSystemPrompt()
    })
    
    if (context.memoryContext) {
      messages.push({
        role: 'system',
        content: `用户画像：\n${context.memoryContext}`
      })
    }
    
    const recentHistory = context.getRecentHistory(5)
    messages.push(...recentHistory)
    
    if (reasoning) {
      messages.push({
        role: 'system',
        content: `参考资料：\n${reasoning}`
      })
    }
    
    messages.push({
      role: 'user',
      content: context.userMessage
    })
    
    const config = {
      ...this.getManifest().configDefaults,
      ...context.configOverrides
    }
    
    const response = await aiService.chat({
      messages,
      ...config
    })
    
    return response.content
  }

  getSystemPrompt() {
    return `你是一个智能学习助手，专门帮助大学生学习。

你的特点：
1. 擅长解释复杂概念，使用通俗易懂的语言
2. 善于举例子和类比，帮助学生理解
3. 鼓励学生提问和思考
4. 提供个性化的学习建议

回答风格：
- 友好、耐心、专业
- 结构清晰，逻辑严谨
- 适当使用表情和格式化，提升可读性
- 遇到不确定的内容，诚实说明

你不仅可以回答问题，还可以：
- 帮助理解笔记内容
- 解释公式和定理
- 提供学习方法和技巧
- 推荐相关的学习资源`
  }
}

module.exports = ChatCapability
