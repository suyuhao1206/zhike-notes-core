class AIService {
  constructor() {
    this.config = {}
    this.functionName = 'aiRouter'
  }

  init(config = {}) {
    this.config = config || {}
    const cloudProvider = (this.config.providers && this.config.providers.cloud) || {}
    this.functionName = cloudProvider.functionName || this.config.functionName || 'aiRouter'
  }

  async chat(options = {}) {
    const result = await this.callRouter('chat', {
      messages: options.messages || [],
      model: options.model
    }, options)

    return {
      content: result.content || result.text || '',
      model: result.model || 'hunyuan',
      usage: result.usage || {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }
    }
  }

  async askQuestion(question, noteContext = '', options = {}) {
    return this.callRouter('askQuestion', { question, noteContext }, options)
  }

  async summarizeNote(content, options = {}) {
    return this.callRouter('summarizeNote', { content }, options)
  }

  async generateExam(content, config = {}, options = {}) {
    return this.callRouter('generateExam', { content, config }, options)
  }

  async generateFlashcards(content, options = {}) {
    return this.callRouter('generateFlashcards', { content }, options)
  }

  async generateEmergency(content, options = {}) {
    return this.callRouter('generateEmergency', { content }, options)
  }

  async callCozeBot(botType, query, options = {}) {
    return this.callRouter('callCozeBot', {
      botType,
      query,
      contentType: options.contentType,
      botId: options.botId
    }, options)
  }

  async callCozeBotWithImage(botType, query, fileId, options = {}) {
    const content = JSON.stringify([
      { type: 'text', text: query },
      { type: 'image', file_id: fileId }
    ])

    return this.callCozeBot(botType, content, {
      ...options,
      contentType: 'object_string'
    })
  }

  async transcribeAudio(filePath, options = {}) {
    if (!filePath) throw new Error('Audio file path is required')

    const upload = await this.uploadAudio(filePath)
    try {
      return await this.callRouter('transcribeAudio', {
        fileID: upload.fileID,
        fileName: upload.fileName,
        duration: options.duration || 0,
        provider: options.provider || 'xfyun',
        allowCozeFallback: options.allowCozeFallback !== false,
        language: options.language,
        pd: options.pd
      }, options)
    } finally {
      if (!options.keepCloudFile) {
        this.deleteCloudFile(upload.fileID)
      }
    }
  }

  async recognizeImage(filePath, options = {}) {
    if (!filePath) throw new Error('Image file path is required')

    const upload = await this.uploadMedia(filePath, 'ocr')
    try {
      return await this.callRouter('recognizeImage', {
        fileID: upload.fileID,
        fileName: upload.fileName,
        prompt: options.prompt
      }, options)
    } finally {
      if (!options.keepCloudFile) {
        this.deleteCloudFile(upload.fileID)
      }
    }
  }

  uploadAudio(filePath) {
    return this.uploadMedia(filePath, 'audio')
  }

  uploadMedia(filePath, folder) {
    return new Promise((resolve, reject) => {
      if (!wx.cloud || !wx.cloud.uploadFile) {
        reject(new Error('wx.cloud.uploadFile is not available'))
        return
      }

      const fileName = guessFileName(filePath, folder === 'audio' ? 'mp3' : 'jpg')
      const cloudPath = `${folder}/${Date.now()}_${randomText(8)}_${fileName}`

      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: res => resolve({
          fileID: res.fileID,
          fileName
        }),
        fail: err => reject(new Error(err.errMsg || 'Media upload failed'))
      })
    })
  }

  deleteCloudFile(fileID) {
    if (!fileID || !wx.cloud || !wx.cloud.deleteFile) return

    wx.cloud.deleteFile({
      fileList: [fileID],
      fail: err => console.warn('Temporary audio cleanup failed:', err)
    })
  }

  callRouter(action, payload = {}, options = {}) {
    return new Promise((resolve, reject) => {
      if (!wx.cloud || !wx.cloud.callFunction) {
        reject(new Error('wx.cloud.callFunction is not available'))
        return
      }

      wx.cloud.callFunction({
        name: options.functionName || this.functionName,
        data: {
          action,
          payload,
          options: stripClientOnlyOptions(options)
        },
        success: res => {
          const result = res.result || {}
          if (!result.success) {
            reject(new Error(result.error || `${action} failed`))
            return
          }
          resolve(result.data)
        },
        fail: err => reject(new Error(err.errMsg || `${action} call failed`))
      })
    })
  }
}

let instance = null

function getAIService() {
  if (!instance) {
    instance = new AIService()
  }
  return instance
}

function stripClientOnlyOptions(options = {}) {
  const sanitized = { ...options }
  delete sanitized.keepCloudFile
  delete sanitized.functionName
  return sanitized
}

function guessFileName(filePath, defaultExt) {
  const cleanPath = String(filePath || '').split('?')[0]
  const name = cleanPath.split('/').pop() || `file_${Date.now()}.${defaultExt}`
  return name.includes('.') ? name : `${name}.${defaultExt}`
}

function randomText(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let text = ''
  for (let index = 0; index < length; index++) {
    text += chars[Math.floor(Math.random() * chars.length)]
  }
  return text
}

module.exports = {
  AIService,
  getAIService,
  init: config => getAIService().init(config),
  chat: options => getAIService().chat(options),
  askQuestion: (question, noteContext, options) => getAIService().askQuestion(question, noteContext, options),
  summarizeNote: (content, options) => getAIService().summarizeNote(content, options),
  generateExam: (content, config, options) => getAIService().generateExam(content, config, options),
  generateFlashcards: (content, options) => getAIService().generateFlashcards(content, options),
  generateEmergency: (content, options) => getAIService().generateEmergency(content, options),
  callCozeBot: (botType, query, options) => getAIService().callCozeBot(botType, query, options),
  callCozeBotWithImage: (botType, query, fileId, options) => getAIService().callCozeBotWithImage(botType, query, fileId, options),
  transcribeAudio: (filePath, options) => getAIService().transcribeAudio(filePath, options),
  recognizeImage: (filePath, options) => getAIService().recognizeImage(filePath, options)
}
