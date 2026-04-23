/**
 * 统一上下文 (UnifiedContext)
 * 管理会话状态、用户输入、历史记录等
 */

const { v4: uuidv4 } = require('uuid')

class UnifiedContext {
  /**
   * @param {Object} options - 上下文选项
   * @param {string} options.sessionId - 会话ID
   * @param {string} options.userMessage - 用户消息
   * @param {Array} options.conversationHistory - 对话历史
   * @param {Array} options.enabledTools - 启用的工具列表
   * @param {string} options.activeCapability - 当前能力
   * @param {Array} options.knowledgeBases - 知识库列表
   * @param {Array} options.attachments - 附件列表
   * @param {Object} options.configOverrides - 配置覆盖
   * @param {string} options.notebookContext - 笔记上下文
   * @param {string} options.memoryContext - 记忆上下文
   */
  constructor(options = {}) {
    this.sessionId = options.sessionId || this.generateId()
    this.userMessage = options.userMessage || ''
    this.conversationHistory = options.conversationHistory || []
    this.enabledTools = options.enabledTools || null
    this.activeCapability = options.activeCapability || null
    this.knowledgeBases = options.knowledgeBases || []
    this.attachments = options.attachments || []
    this.configOverrides = options.configOverrides || {}
    this.notebookContext = options.notebookContext || ''
    this.memoryContext = options.memoryContext || ''
    this.metadata = options.metadata || {}
  }

  /**
   * 生成唯一ID
   */
  generateId() {
    return uuidv4()
  }

  /**
   * 添加对话历史
   */
  addToHistory(role, content) {
    this.conversationHistory.push({
      role,
      content,
      timestamp: Date.now()
    })

    if (this.conversationHistory.length > 50) {
      this.conversationHistory = this.conversationHistory.slice(-50)
    }
  }

  /**
   * 获取最近N条对话历史（OpenAI格式）
   */
  getRecentHistory(n = 10) {
    return this.conversationHistory.slice(-n).map(msg => ({
      role: msg.role,
      content: msg.content
    }))
  }

  /**
   * 设置用户消息
   */
  setUserMessage(message) {
    this.userMessage = message
    return this
  }

  /**
   * 设置能力
   */
  setCapability(capability) {
    this.activeCapability = capability
    return this
  }

  /**
   * 启用工具
   */
  enableTools(tools) {
    this.enabledTools = Array.isArray(tools) ? tools : [tools]
    return this
  }

  /**
   * 设置知识库
   */
  setKnowledgeBases(kbs) {
    this.knowledgeBases = Array.isArray(kbs) ? kbs : [kbs]
    return this
  }

  /**
   * 添加附件
   */
  addAttachment(attachment) {
    this.attachments.push({
      type: attachment.type || 'file',
      url: attachment.url || '',
      base64: attachment.base64 || '',
      filename: attachment.filename || '',
      mime_type: attachment.mime_type || ''
    })
    return this
  }

  /**
   * 设置配置
   */
  setConfig(key, value) {
    this.configOverrides[key] = value
    return this
  }

  /**
   * 序列化为JSON
   */
  toJSON() {
    return {
      sessionId: this.sessionId,
      userMessage: this.userMessage,
      conversationHistory: this.conversationHistory,
      enabledTools: this.enabledTools,
      activeCapability: this.activeCapability,
      knowledgeBases: this.knowledgeBases,
      attachments: this.attachments,
      configOverrides: this.configOverrides,
      notebookContext: this.notebookContext,
      memoryContext: this.memoryContext,
      metadata: this.metadata
    }
  }

  /**
   * 从JSON创建上下文
   */
  static fromJSON(json) {
    return new UnifiedContext(json)
  }

  /**
   * 克隆上下文
   */
  clone() {
    return UnifiedContext.fromJSON(this.toJSON())
  }
}

module.exports = UnifiedContext
