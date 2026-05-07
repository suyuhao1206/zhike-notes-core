/**
 * AI服务 (AI Service)
 * 统一的AI服务接口，支持多种后端
 */

class AIService {
  constructor() {
    this.provider = null
    this.config = {}
  }

  /**
   * 初始化服务
   * @param {Object} config - 配置选项
   */
  init(config = {}) {
    this.config = {
      provider: config.provider || 'coze',
      apiKeys: config.apiKeys || {},
      models: config.models || {},
      ...config
    }
    
    this.provider = this.config.provider
    
    if (this.provider === 'coze') {
      const cozeConfig = this.config.providers?.coze || {}
      this.config.apiKeys = {
        cozeToken: cozeConfig.apiKey || this.config.apiKeys.cozeToken || '',
        cozeBotId: cozeConfig.bots?.qaAssistant || this.config.apiKeys.cozeBotId || ''
      }
    }
  }

  /**
   * 聊天对话
   * @param {Object} options - 聊天选项
   */
  async chat(options) {
    const {
      messages,
      temperature = 0.7,
      maxTokens = 2000,
      stream = false
    } = options

    if (this.provider === 'coze') {
      return await this.chatWithCoze(messages, { temperature, maxTokens, stream })
    } else if (this.provider === 'openai') {
      return await this.chatWithOpenAI(messages, { temperature, maxTokens, stream })
    } else {
      throw new Error(`Unsupported provider: ${this.provider}`)
    }
  }

  /**
   * Coze聊天
   */
  async chatWithCoze(messages, options) {
    const { temperature, maxTokens } = options
    
    const botId = this.config.apiKeys.cozeBotId
    const token = this.config.apiKeys.cozeToken
    
    if (!botId || !token) {
      throw new Error('Coze API credentials not configured')
    }

    try {
      const response = await wx.request({
        url: 'https://api.coze.cn/v3/chat',
        method: 'POST',
        header: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          bot_id: botId,
          user_id: 'user_' + Date.now(),
          stream: false,
          auto_save_history: true,
          additional_messages: messages.map(m => ({
            role: m.role,
            content: m.content,
            content_type: 'text'
          }))
        }
      })

      if (response.statusCode !== 200) {
        throw new Error(`Coze API error: ${response.statusCode}`)
      }

      const data = response.data
      const content = data.data?.content || ''
      
      return {
        content,
        model: 'coze',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        }
      }
    } catch (error) {
      console.error('Coze chat failed:', error)
      throw error
    }
  }

  /**
   * OpenAI聊天
   */
  async chatWithOpenAI(messages, options) {
    const { temperature, maxTokens, stream } = options
    
    const apiKey = this.config.apiKeys.openaiKey
    const model = this.config.models.chat || 'gpt-4o-mini'
    const host = this.config.apiKeys.openaiHost || 'https://api.openai.com/v1'
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    try {
      const response = await wx.request({
        url: `${host}/chat/completions`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        data: {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream
        }
      })

      if (response.statusCode !== 200) {
        throw new Error(`OpenAI API error: ${response.statusCode}`)
      }

      const data = response.data
      const choice = data.choices[0]
      
      return {
        content: choice.message.content,
        model: data.model,
        usage: data.usage
      }
    } catch (error) {
      console.error('OpenAI chat failed:', error)
      throw error
    }
  }

  /**
   * 获取向量嵌入
   * @param {Array} texts - 文本数组
   * @param {Object} options - 选项
   */
  async getEmbeddings(texts, options = {}) {
    const { model = 'text-embedding-3-small' } = options
    
    const apiKey = this.config.apiKeys.openaiKey
    const host = this.config.apiKeys.openaiHost || 'https://api.openai.com/v1'
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured for embeddings')
    }

    try {
      const response = await wx.request({
        url: `${host}/embeddings`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        data: {
          model,
          input: texts
        }
      })

      if (response.statusCode !== 200) {
        throw new Error(`OpenAI Embeddings API error: ${response.statusCode}`)
      }

      const data = response.data
      return data.data.map(item => item.embedding)
    } catch (error) {
      console.error('Failed to get embeddings:', error)
      throw error
    }
  }

  /**
   * 语音转文字
   * @param {string} filePath - 音频文件路径
   */
  async transcribeAudio(filePath) {
    if (this.provider === 'coze') {
      return await this.transcribeWithCoze(filePath)
    } else {
      return await this.transcribeWithOpenAI(filePath)
    }
  }

  /**
   * Coze语音转写
   */
  async transcribeWithCoze(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: 'https://api.coze.cn/v1/audio/transcriptions',
        filePath: filePath,
        name: 'file',
        header: {
          'Authorization': `Bearer ${this.config.apiKeys.cozeToken}`
        },
        success: (res) => {
          if (res.statusCode === 200) {
            const data = JSON.parse(res.data)
            resolve({
              text: data.text,
              duration: data.duration
            })
          } else {
            reject(new Error(`Coze transcription failed: ${res.statusCode}`))
          }
        },
        fail: reject
      })
    })
  }

  /**
   * OpenAI语音转写
   */
  async transcribeWithOpenAI(filePath) {
    const apiKey = this.config.apiKeys.openaiKey
    const host = this.config.apiKeys.openaiHost || 'https://api.openai.com/v1'

    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${host}/audio/transcriptions`,
        filePath: filePath,
        name: 'file',
        header: {
          'Authorization': `Bearer ${apiKey}`
        },
        formData: {
          model: 'whisper-1'
        },
        success: (res) => {
          if (res.statusCode === 200) {
            const data = JSON.parse(res.data)
            resolve({
              text: data.text,
              duration: data.duration || 0
            })
          } else {
            reject(new Error(`OpenAI transcription failed: ${res.statusCode}`))
          }
        },
        fail: reject
      })
    })
  }

  /**
   * 流式聊天（返回迭代器）
   */
  async *streamChat(options) {
    const { messages, temperature = 0.7, maxTokens = 2000 } = options
    
    const apiKey = this.config.apiKeys.openaiKey
    const model = this.config.models.chat || 'gpt-4o-mini'
    const host = this.config.apiKeys.openaiHost || 'https://api.openai.com/v1'

    if (!apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const response = await fetch(`${host}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true
      })
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'))

      for (const line of lines) {
        const data = line.replace(/^data:\s*/, '')
        if (data === '[DONE]') return

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices[0]?.delta?.content || ''
          if (content) {
            yield content
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }
}

let instance = null

function getAIService() {
  if (!instance) {
    instance = new AIService()
  }
  return instance
}

module.exports = {
  AIService,
  getAIService
}
