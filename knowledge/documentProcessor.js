/**
 * 文档处理器 (Document Processor)
 * 文档分块和预处理
 */

class DocumentProcessor {
  /**
   * @param {Object} config - 配置选项
   */
  constructor(config = {}) {
    this.chunkSize = config.chunkSize || 500
    this.chunkOverlap = config.chunkOverlap || 50
    this.minChunkSize = config.minChunkSize || 100
  }

  /**
   * 文档分块
   * @param {string} content - 文档内容
   * @returns {Array<string>} 文本块数组
   */
  async chunk(content) {
    if (!content || typeof content !== 'string') {
      return []
    }

    // 1. 预处理
    const cleaned = this.preprocess(content)

    // 2. 尝试按段落分割
    const paragraphs = this.splitByParagraphs(cleaned)

    // 3. 对每个段落进行分块
    const chunks = []
    
    for (const para of paragraphs) {
      if (para.length <= this.chunkSize) {
        chunks.push(para)
      } else {
        // 段落太长，按句子分割
        const sentenceChunks = this.splitBySentences(para)
        chunks.push(...sentenceChunks)
      }
    }

    // 4. 合并过小的块
    const mergedChunks = this.mergeSmallChunks(chunks)

    // 5. 添加重叠
    const overlappedChunks = this.addOverlap(mergedChunks)

    return overlappedChunks
  }

  /**
   * 预处理文档
   */
  preprocess(content) {
    return content
      .replace(/\r\n/g, '\n')           // 统一换行符
      .replace(/\n{3,}/g, '\n\n')       // 最多两个连续换行
      .replace(/[ \t]{2,}/g, ' ')       // 多个空格变一个
      .trim()
  }

  /**
   * 按段落分割
   */
  splitByParagraphs(content) {
    return content
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
  }

  /**
   * 按句子分割
   */
  splitBySentences(paragraph) {
    const sentences = []
    
    // 中文句子分割
    const chinesePattern = /[^。！？\n]+[。！？\n]/g
    const matches = paragraph.match(chinesePattern)
    
    if (matches) {
      let currentChunk = ''
      
      for (const sentence of matches) {
        if (currentChunk.length + sentence.length <= this.chunkSize) {
          currentChunk += sentence
        } else {
          if (currentChunk.length >= this.minChunkSize) {
            sentences.push(currentChunk.trim())
          }
          currentChunk = sentence
        }
      }
      
      // 添加最后一个块
      if (currentChunk.length >= this.minChunkSize) {
        sentences.push(currentChunk.trim())
      }
    } else {
      // 按固定大小分割
      for (let i = 0; i < paragraph.length; i += this.chunkSize) {
        const chunk = paragraph.slice(i, i + this.chunkSize)
        if (chunk.length >= this.minChunkSize) {
          sentences.push(chunk.trim())
        }
      }
    }

    return sentences
  }

  /**
   * 合并过小的块
   */
  mergeSmallChunks(chunks) {
    const merged = []
    let current = ''

    for (const chunk of chunks) {
      if (current.length + chunk.length <= this.chunkSize) {
        current += (current ? '\n\n' : '') + chunk
      } else {
        if (current.length >= this.minChunkSize) {
          merged.push(current)
        }
        current = chunk
      }
    }

    if (current.length >= this.minChunkSize) {
      merged.push(current)
    }

    return merged
  }

  /**
   * 添加重叠
   */
  addOverlap(chunks) {
    if (this.chunkOverlap === 0 || chunks.length <= 1) {
      return chunks
    }

    const overlapped = []

    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i]

      // 添加前一个块的后半部分作为重叠
      if (i > 0) {
        const prevChunk = chunks[i - 1]
        const overlapStart = Math.max(0, prevChunk.length - this.chunkOverlap)
        const overlap = prevChunk.slice(overlapStart)
        chunk = overlap + '\n\n' + chunk
      }

      overlapped.push(chunk)
    }

    return overlapped
  }

  /**
   * 提取关键词
   */
  extractKeywords(text) {
    const keywords = []
    
    // 简单的关键词提取（实际项目中可以使用TF-IDF或TextRank）
    const words = text.split(/[\s\n]+/)
    
    // 过滤停用词
    const stopWords = new Set(['的', '是', '在', '了', '和', '与', '或', '等', '这', '那', '有', '为'])
    
    const filtered = words.filter(w => {
      return w.length > 1 && !stopWords.has(w)
    })

    // 统计词频
    const wordCount = {}
    for (const word of filtered) {
      wordCount[word] = (wordCount[word] || 0) + 1
    }

    // 取前10个高频词
    const sorted = Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word)

    return sorted
  }

  /**
   * 提取摘要
   */
  extractSummary(text, maxSentences = 3) {
    const sentences = text.match(/[^。！？\n]+[。！？\n]/g) || []
    
    if (sentences.length <= maxSentences) {
      return text.trim()
    }

    // 简单的摘要提取：取前N个句子
    return sentences.slice(0, maxSentences).join('').trim()
  }

  /**
   * 检测语言
   */
  detectLanguage(text) {
    const chineseCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const totalLength = text.length
    
    if (chineseCount / totalLength > 0.3) {
      return 'zh'
    }
    
    return 'en'
  }

  /**
   * 统计信息
   */
  getStats(text) {
    const chars = text.length
    const words = text.split(/[\s\n]+/).filter(w => w.length > 0).length
    const sentences = (text.match(/[。！？.\n]/g) || []).length
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0).length

    return {
      characters: chars,
      words,
      sentences,
      paragraphs,
      readingTime: Math.ceil(chars / 500) // 假设每分钟阅读500字
    }
  }
}

module.exports = DocumentProcessor
