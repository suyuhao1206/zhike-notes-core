/**
 * 向量存储 (Vector Store)
 * 存储和检索向量嵌入
 */

class VectorStore {
  /**
   * @param {string} kbName - 知识库名称
   */
  constructor(kbName) {
    this.kbName = kbName
    this.vectors = []
    this.metadata = []
    this.storageKey = `vs_${kbName}`
  }

  /**
   * 初始化向量存储
   */
  async init() {
    await this.load()
  }

  /**
   * 添加向量
   * @param {Array} chunks - 文本块
   * @param {Array} embeddings - 向量嵌入
   * @param {Object} meta - 元数据
   */
  async addVectors(chunks, embeddings, meta = {}) {
    if (chunks.length !== embeddings.length) {
      throw new Error('Chunks and embeddings length mismatch')
    }

    for (let i = 0; i < chunks.length; i++) {
      this.vectors.push(embeddings[i])
      this.metadata.push({
        chunk: chunks[i],
        documentId: meta.documentId || '',
        documentName: meta.documentName || '',
        index: i,
        timestamp: Date.now()
      })
    }

    await this.save()
  }

  /**
   * 搜索相似向量
   * @param {Array} queryVector - 查询向量
   * @param {number} topK - 返回结果数量
   */
  async search(queryVector, topK = 5) {
    if (this.vectors.length === 0) {
      return []
    }

    const scores = []
    
    for (let i = 0; i < this.vectors.length; i++) {
      const score = this.cosineSimilarity(queryVector, this.vectors[i])
      scores.push({
        index: i,
        score,
        ...this.metadata[i]
      })
    }

    scores.sort((a, b) => b.score - a.score)

    return scores.slice(0, topK)
  }

  /**
   * 计算余弦相似度
   */
  cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) {
      return 0
    }

    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i]
      norm1 += vec1[i] * vec1[i]
      norm2 += vec2[i] * vec2[i]
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  }

  /**
   * 删除指定文档的向量
   * @param {string} documentId - 文档ID
   */
  async deleteByDocumentId(documentId) {
    const indicesToDelete = []
    
    for (let i = this.metadata.length - 1; i >= 0; i--) {
      if (this.metadata[i].documentId === documentId) {
        indicesToDelete.push(i)
      }
    }

    for (const index of indicesToDelete) {
      this.vectors.splice(index, 1)
      this.metadata.splice(index, 1)
    }

    await this.save()
  }

  /**
   * 清空向量存储
   */
  async clear() {
    this.vectors = []
    this.metadata = []
    await this.save()
  }

  /**
   * 保存到本地存储
   */
  async save() {
    try {
      const data = {
        vectors: this.vectors,
        metadata: this.metadata
      }
      
      // 如果数据太大，分片存储
      const dataStr = JSON.stringify(data)
      const maxSize = 900 * 1024 // 900KB
      
      if (dataStr.length < maxSize) {
        wx.setStorageSync(this.storageKey, dataStr)
      } else {
        await this.saveSharded(data)
      }
    } catch (error) {
      console.error('Failed to save vector store:', error)
      throw error
    }
  }

  /**
   * 分片保存大容量数据
   */
  async saveSharded(data) {
    const shards = this.splitIntoShards(data, 800 * 1024)
    
    // 保存分片数量
    wx.setStorageSync(`${this.storageKey}_shards`, shards.length)
    
    // 保存每个分片
    for (let i = 0; i < shards.length; i++) {
      wx.setStorageSync(`${this.storageKey}_shard_${i}`, shards[i])
    }
  }

  /**
   * 数据分片
   */
  splitIntoShards(data, maxSize) {
    const dataStr = JSON.stringify(data)
    const shards = []
    
    for (let i = 0; i < dataStr.length; i += maxSize) {
      shards.push(dataStr.slice(i, i + maxSize))
    }
    
    return shards
  }

  /**
   * 从本地存储加载
   */
  async load() {
    try {
      // 尝试直接加载
      const dataStr = wx.getStorageSync(this.storageKey)
      
      if (dataStr) {
        const data = JSON.parse(dataStr)
        this.vectors = data.vectors || []
        this.metadata = data.metadata || []
        return
      }
      
      // 尝试加载分片数据
      const shardCount = wx.getStorageSync(`${this.storageKey}_shards`)
      
      if (shardCount) {
        await this.loadSharded(shardCount)
      }
    } catch (error) {
      console.error('Failed to load vector store:', error)
      this.vectors = []
      this.metadata = []
    }
  }

  /**
   * 加载分片数据
   */
  async loadSharded(shardCount) {
    let dataStr = ''
    
    for (let i = 0; i < shardCount; i++) {
      const shard = wx.getStorageSync(`${this.storageKey}_shard_${i}`)
      if (shard) {
        dataStr += shard
      }
    }
    
    if (dataStr) {
      const data = JSON.parse(dataStr)
      this.vectors = data.vectors || []
      this.metadata = data.metadata || []
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      vectorCount: this.vectors.length,
      metadataCount: this.metadata.length
    }
  }
}

module.exports = VectorStore
