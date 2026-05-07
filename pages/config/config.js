const api = require('../../api/api.js')

Page({
  data: {
    bots: {
      noteSummary: '',
      qaAssistant: '',
      examGenerator: '',
      flashcardGen: '',
      ocrVision: '',
      audioTranscribe: ''
    },
    botLabels: {
      noteSummary: '笔记总结 Bot',
      qaAssistant: '答疑助手 Bot',
      examGenerator: '试卷生成 Bot',
      flashcardGen: '卡片生成 Bot',
      ocrVision: 'OCR/视觉 Bot',
      audioTranscribe: '录音转写 Bot'
    }
  },

  onLoad() {
    this.loadConfig()
  },

  loadConfig() {
    const app = getApp()
    const config = app.globalData.cozeConfig || {}

    this.setData({
      bots: {
        ...this.data.bots,
        ...(config.bots || {})
      }
    })
  },

  onBotInput(e) {
    const botType = e.currentTarget.dataset.type
    this.setData({
      [`bots.${botType}`]: e.detail.value
    })
  },

  saveConfig() {
    const app = getApp()
    app.setCozeBots(this.data.bots)

    wx.showToast({
      title: 'Bot ID 已保存',
      icon: 'success'
    })

    setTimeout(() => {
      wx.navigateBack()
    }, 800)
  },

  async testConnection() {
    wx.showLoading({ title: '测试中...' })

    try {
      const result = await api.askQuestion('你好，请用一句话回复连接正常。')
      wx.hideLoading()
      wx.showModal({
        title: '测试完成',
        content: `云端 AI 网关已响应：${JSON.stringify(result).slice(0, 120)}`,
        showCancel: false
      })
    } catch (error) {
      wx.hideLoading()
      wx.showModal({
        title: '测试失败',
        content: `请确认 aiRouter 云函数已部署，并配置必要环境变量。\n\n${error.message}`,
        showCancel: false
      })
    }
  },

  showHelp() {
    wx.showModal({
      title: '云端配置说明',
      content: [
        '密钥不再保存在小程序端。',
        '',
        '请在 aiRouter 云函数环境变量中配置：',
        'COZE_TOKEN',
        'COZE_BOT_EXAM_GENERATOR',
        'COZE_BOT_FLASHCARD_GEN',
        'COZE_BOT_AUDIO_TRANSCRIBE',
        'XFYUN_APP_ID',
        'XFYUN_API_KEY',
        'XFYUN_API_SECRET',
        '',
        '轻量答疑、笔记总结、急救模式默认走混元；试卷和背诵卡片默认走 Coze。'
      ].join('\n'),
      showCancel: false
    })
  }
})
