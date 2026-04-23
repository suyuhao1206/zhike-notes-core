/**
 * 知识库管理器 (Knowledge Base Manager)
 * 管理多个知识库的创建、查询、删除
 */

const KnowledgeBase = require('./knowledgeBase')

class KnowledgeBaseManager {
  constructor() {
    this.knowledgeBases = new Map()
    this.defaultKB = null
  }

  /**
   * 创建知识库
   * @param {string} name - 知识库名称
   * @param {Object} options - 配置选项
   */
  async create(name, options = {}) {
    if (this.knowledgeBases.has(name)) {
      throw new Error(`Knowledge base "${name}" already exists`)
    }

    const kb = new KnowledgeBase(name, options)
    await kb.init()
    
    this.knowledgeBases.set(name, kb)
    
    if (!this.defaultKB) {
      this.defaultKB = name
    }
    
    await this.saveMetadata()
    
    return kb
  }

  /**
   * 获取知识库
   * @param {string} name - 知识库名称
   */
  async get(name) {
    if (!name) {
      return await this.getDefault()
    }

    if (!this.knowledgeBases.has(name)) {
      await this.load(name)
    }

    return this.knowledgeBases.get(name)
  }

  /**
   * 获取默认知识库
   */
  async getDefault() {
    if (!this.defaultKB) {
      return null
    }

    return await this.get(this.defaultKB)
  }

  /**
   * 设置默认知识库
   * @param {string} name - 知识库名称
   */
  setDefault(name) {
    if (!this.knowledgeBases.has(name)) {
      throw new Error(`Knowledge base "${name}" not found`)
    }

    this.defaultKB = name
    this.saveMetadata()
  }

  /**
   * 删除知识库
   * @param {string} name - 知识库名称
   */
  async delete(name) {
    if (!this.knowledgeBases.has(name)) {
      return false
    }

    const kb = this.knowledgeBases.get(name)
    await kb.clear()

    this.knowledgeBases.delete(name)

    if (this.defaultKB === name) {
      this.defaultKB = this.knowledgeBases.keys().next().value || null
    }

    await this.saveMetadata()
    
    return true
  }

  /**
   * 列出所有知识库
   */
  list() {
    const list = []
    for (const [name, kb] of this.knowledgeBases) {
      list.push({
        name,
        documentCount: kb.documentCount,
        vectorCount: kb.vectorCount,
        isDefault: name === this.defaultKB
      })
    }
    return list
  }

  /**
   * 加载知识库
   */
  async load(name) {
    const metadata = this.loadMetadata()
    
    if (metadata.bases && metadata.bases[name]) {
      const kb = new KnowledgeBase(name, metadata.bases[name])
      await kb.load()
      this.knowledgeBases.set(name, kb)
      return kb
    }
    
    return null
  }

  /**
   * 加载所有知识库
   */
  async loadAll() {
    const metadata = this.loadMetadata()
    
    if (metadata.bases) {
      for (const [name, config] of Object.entries(metadata.bases)) {
        try {
          const kb = new KnowledgeBase(name, config)
          await kb.load()
          this.knowledgeBases.set(name, kb)
        } catch (error) {
          console.error(`Failed to load knowledge base ${name}:`, error)
        }
      }
    }
    
    this.defaultKB = metadata.default || null
  }

  /**
   * 保存元数据
   */
  async saveMetadata() {
    const metadata = {
      default: this.defaultKB,
      bases: {}
    }

    for (const [name, kb] of this.knowledgeBases) {
      metadata.bases[name] = kb.getConfig()
    }

    try {
      wx.setStorageSync('kb_metadata', JSON.stringify(metadata))
    } catch (error) {
      console.error('Failed to save KB metadata:', error)
    }
  }

  /**
   * 加载元数据
   */
  loadMetadata() {
    try {
      const data = wx.getStorageSync('kb_metadata')
      return data ? JSON.parse(data) : { default: null, bases: {} }
    } catch (error) {
      console.error('Failed to load KB metadata:', error)
      return { default: null, bases: {} }
    }
  }
}

let instance = null

function getKBManager() {
  if (!instance) {
    instance = new KnowledgeBaseManager()
  }
  return instance
}

// 导出类和单例函数
module.exports = KnowledgeBaseManager
module.exports.KnowledgeBaseManager = KnowledgeBaseManager
module.exports.getKBManager = getKBManager
