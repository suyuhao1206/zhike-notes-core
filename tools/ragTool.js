/**
 * RAG工具 (RAG Tool)
 * 从知识库检索相关信息
 */

const BaseTool = require('./baseTool')

class RAGTool extends BaseTool {
  constructor() {
    super()
    // 延迟加载 KnowledgeBaseManager，避免循环依赖
    this._kbManager = null
  }

  get kbManager() {
    if (!this._kbManager) {
      const KnowledgeBaseManager = require('../knowledge/knowledgeBaseManager')
      const { getKBManager } = require('../knowledge/knowledgeBaseManager')
      this._kbManager = getKBManager()
    }
    return this._kbManager
  }

  getDefinition() {
    return {
      name: 'rag',
      description: '从知识库中检索相关信息，支持向量搜索和关键词搜索',
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: '搜索查询文本',
          required: true
        },
        {
          name: 'knowledgeBase',
          type: 'string',
          description: '知识库名称，不指定则使用默认知识库',
          required: false
        },
        {
          name: 'topK',
          type: 'number',
          description: '返回结果数量，默认5',
          required: false
        },
        {
          name: 'threshold',
          type: 'number',
          description: '相似度阈值，0-1之间，默认0.7',
          required: false
        }
      ]
    }
  }

  async execute(params) {
    const errors = this.validateParams(params)
    if (errors.length > 0) {
      throw new Error(`Parameter validation failed: ${errors.join(', ')}`)
    }

    const { query, knowledgeBase, topK = 5, threshold = 0.7 } = params

    try {
      const kb = knowledgeBase 
        ? await this.kbManager.get(knowledgeBase)
        : await this.kbManager.getDefault()

      if (!kb) {
        return {
          success: false,
          content: '未找到指定的知识库',
          sources: []
        }
      }

      const results = await kb.search(query, { topK, threshold })

      const content = this.formatResults(results)
      const sources = results.map(r => ({
        source: r.source || r.documentId,
        content: r.content,
        score: r.score
      }))

      return {
        success: true,
        content,
        sources,
        metadata: {
          totalResults: results.length,
          query,
          knowledgeBase: kb.name
        }
      }
    } catch (error) {
      console.error('RAG tool execution failed:', error)
      return {
        success: false,
        content: `知识库检索失败: ${error.message}`,
        sources: []
      }
    }
  }

  formatResults(results) {
    if (!results || results.length === 0) {
      return '未找到相关信息'
    }

    const formatted = results.map((r, i) => {
      return `[${i + 1}] ${r.content}`
    }).join('\n\n')

    return formatted
  }
}

module.exports = RAGTool
