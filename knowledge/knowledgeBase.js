/**
 * 知识库 (Knowledge Base)
 * 单个知识库的实现，支持文档添加、向量化、搜索
 */

const VectorStore = require('./vectorStore')
const DocumentProcessor = require('./documentProcessor')

class KnowledgeBase {
  /**
   * @param {string} name - 知识库名称
   * @param {Object} config - 配置选项
   */
  constructor(name, config = {}) {
    this.name = name
    this.config = {
      chunkSize: config.chunkSize || 500,
      chunkOverlap: config.chunkOverlap || 50,
      embeddingModel: config.embeddingModel || 'text-embedding-3-small',
      ...config
    }
    
    this.vectorStore = new VectorStore(name)
    this.docProcessor = new DocumentProcessor(this.config)
    
    this.documents = []
    this.documentCount = 0
    this.vectorCount = 0
    this.initialized = false
  }

  /**
   * 初始化知识库
   */
  async init() {
    if (this.initialized) return

    await this.vectorStore.init()
    await this.loadDocuments()
    
    this.initialized = true
  }

  /**
   * 加载知识库
   */
  async load() {
    await this.loadDocuments()
    this.initialized = true
  }

  /**
   * 添加文档
   * @param {string|Object} document - 文档内容或文档对象
   */
  async addDocument(document) {
    if (!this.initialized) {
      await this.init()
    }

    const doc = typeof document === 'string' 
      ? { content: document, id: this.generateId() }
      : document

    const chunks = await this.docProcessor.chunk(doc.content)
    
    const embeddings = await this.getEmbeddings(chunks)
    
    await this.vectorStore.addVectors(chunks, embeddings, {
      documentId: doc.id,
      documentName: doc.name || 'Untitled'
    })
    
    this.documents.push({
      id: doc.id,
      name: doc.name || 'Untitled',
      content: doc.content,
      chunkCount: chunks.length,
      addedAt: Date.now()
    })
    
    this.documentCount = this.documents.length
    this.vectorCount += chunks.length
    
    await this.saveDocuments()
    
    return {
      documentId: doc.id,
      chunkCount: chunks.length
    }
  }

  /**
   * 批量添加文档
   * @param {Array} documents - 文档数组
   */
  async addDocuments(documents) {
    const results = []
    for (const doc of documents) {
      try {
        const result = await this.addDocument(doc)
        results.push(result)
      } catch (error) {
        console.error('Failed to add document:', error)
      }
    }
    return results
  }

  /**
   * 删除文档
   * @param {string} documentId - 文档ID
   */
  async deleteDocument(documentId) {
    const index = this.documents.findIndex(d => d.id === documentId)
    if (index === -1) return false

    const doc = this.documents[index]
    
    await this.vectorStore.deleteByDocumentId(documentId)
    
    this.vectorCount -= doc.chunkCount
    this.documents.splice(index, 1)
    this.documentCount = this.documents.length
    
    await this.saveDocuments()
    
    return true
  }

  /**
   * 搜索知识库
   * @param {string} query - 查询文本
   * @param {Object} options - 搜索选项
   */
  async search(query, options = {}) {
    if (!this.initialized) {
      await this.init()
    }

    const {
      topK = 5,
      threshold = 0.7
    } = options

    const queryEmbedding = await this.getEmbeddings([query])
    const queryVector = queryEmbedding[0]

    const results = await this.vectorStore.search(queryVector, topK)
    
    const filtered = results.filter(r => r.score >= threshold)
    
    return filtered
  }

  /**
   * 获取向量嵌入
   * @param {Array} texts - 文本数组
   */
  async getEmbeddings(texts) {
    const aiService = require('../services/aiService')
    
    return await aiService.getEmbeddings(texts, {
      model: this.config.embeddingModel
    })
  }

  /**
   * 清空知识库
   */
  async clear() {
    await this.vectorStore.clear()
    this.documents = []
    this.documentCount = 0
    this.vectorCount = 0
    await this.saveDocuments()
  }

  /**
   * 保存文档列表
   */
  async saveDocuments() {
    const storageKey = `kb_${this.name}_documents`
    try {
      wx.setStorageSync(storageKey, JSON.stringify(this.documents))
    } catch (error) {
      console.error('Failed to save documents:', error)
    }
  }

  /**
   * 加载文档列表
   */
  async loadDocuments() {
    const storageKey = `kb_${this.name}_documents`
    try {
      const data = wx.getStorageSync(storageKey)
      if (data) {
        this.documents = JSON.parse(data)
        this.documentCount = this.documents.length
        this.vectorCount = this.documents.reduce((sum, doc) => sum + doc.chunkCount, 0)
      }
    } catch (error) {
      console.error('Failed to load documents:', error)
      this.documents = []
    }
  }

  /**
   * 获取配置
   */
  getConfig() {
    return { ...this.config }
  }

  /**
   * 生成ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      name: this.name,
      documentCount: this.documentCount,
      vectorCount: this.vectorCount,
      config: this.config,
      documents: this.documents.map(d => ({
        id: d.id,
        name: d.name,
        chunkCount: d.chunkCount,
        addedAt: d.addedAt
      }))
    }
  }
}

module.exports = KnowledgeBase
