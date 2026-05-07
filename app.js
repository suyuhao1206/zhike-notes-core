const internalAIConfig = require('./config/ai.config.js')
const DB = require('./utils/db.js')
const { getOrchestrator } = require('./core/orchestrator')
const { getAIService } = require('./services/aiService')

const CLOUD_ENV = 'cloud1-6gegqlssbeb8ee83'

App({
  onLaunch() {
    console.log('Zhike Notes starting...')
    this.initPromise = this.bootstrap()
  },

  globalData: {
    userInfo: null,
    isLoggedIn: false,
    openId: null,
    token: null,
    appReady: false,
    aiConfig: internalAIConfig.getAIConfigByEnv('develop'),
    cozeConfig: {
      baseUrl: 'cloud://aiRouter',
      token: '',
      bots: { ...internalAIConfig.defaultBots }
    },
    xfyunConfig: {
      baseUrl: 'cloud://aiRouter',
      appId: '',
      apiKey: '',
      apiSecret: ''
    }
  },

  async bootstrap() {
    try {
      if (wx.cloud) {
        wx.cloud.init({
          env: CLOUD_ENV,
          traceUser: true
        })
        await DB.init()
      } else {
        console.warn('wx.cloud is not available. Please use base library 2.2.3 or later.')
      }

      this.clearLegacyAISecrets()
      this.checkLoginStatus()
      this.initAIConfig()
      await this.initNewArchitecture()
      this.globalData.appReady = true
    } catch (error) {
      console.error('App bootstrap failed:', error)
      this.globalData.appReady = false
    }
  },

  ensureReady() {
    return this.initPromise || Promise.resolve()
  },

  getEnvVersion() {
    try {
      const accountInfo = wx.getAccountInfoSync && wx.getAccountInfoSync()
      return (accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion) || 'develop'
    } catch (error) {
      return 'develop'
    }
  },

  initAIConfig() {
    const envConfig = internalAIConfig.getAIConfigByEnv(this.getEnvVersion())
    const savedBots = wx.getStorageSync('cozeBots')
    const aiConfig = this.sanitizeAIConfig(envConfig)

    if (savedBots && aiConfig.providers && aiConfig.providers.coze) {
      aiConfig.providers.coze.bots = {
        ...(aiConfig.providers.coze.bots || {}),
        ...this.compactObject(savedBots)
      }
    }

    this.globalData.aiConfig = aiConfig
    this.syncCozeConfigFromAI()
    this.syncXfyunConfigFromAI()
  },

  sanitizeAIConfig(config = {}) {
    const clone = JSON.parse(JSON.stringify(config || {}))
    const providers = clone.providers || {}

    Object.keys(providers).forEach(providerName => {
      delete providers[providerName].token
      delete providers[providerName].apiKey
      delete providers[providerName].apiSecret
      delete providers[providerName].secret
    })

    clone.provider = 'cloud'
    return clone
  },

  compactObject(value = {}) {
    return Object.keys(value).reduce((result, key) => {
      if (value[key]) result[key] = value[key]
      return result
    }, {})
  },

  clearLegacyAISecrets() {
    wx.removeStorageSync('cozeToken')
    wx.removeStorageSync('xfyunConfig')

    const storedAIConfig = wx.getStorageSync('aiConfig')
    if (storedAIConfig && JSON.stringify(storedAIConfig).match(/apiKey|apiSecret|token/i)) {
      wx.removeStorageSync('aiConfig')
    }
  },

  syncCozeConfigFromAI() {
    const cozeProvider = (this.globalData.aiConfig.providers && this.globalData.aiConfig.providers.coze) || {}
    this.globalData.cozeConfig = {
      baseUrl: 'cloud://aiRouter',
      token: '',
      bots: cozeProvider.bots || {}
    }
  },

  syncXfyunConfigFromAI() {
    this.globalData.xfyunConfig = {
      baseUrl: 'cloud://aiRouter',
      appId: '',
      apiKey: '',
      apiSecret: ''
    }
  },

  async initNewArchitecture() {
    if (this.archInitPromise) return this.archInitPromise

    this.archInitPromise = (async () => {
      const aiService = getAIService()
      aiService.init(this.globalData.aiConfig)

      const orchestrator = getOrchestrator()
      await orchestrator.init()
      this.orchestrator = orchestrator

      console.log('Architecture initialized:', {
        capabilities: orchestrator.getAvailableCapabilities(),
        tools: orchestrator.getAvailableTools()
      })
    })().catch(error => {
      this.archInitPromise = null
      console.error('Architecture initialization failed:', error)
      throw error
    })

    return this.archInitPromise
  },

  setAIConfig(config) {
    this.globalData.aiConfig = this.sanitizeAIConfig(config)
    this.syncCozeConfigFromAI()
    this.syncXfyunConfigFromAI()
  },

  setCozeToken() {
    wx.removeStorageSync('cozeToken')
    console.warn('Coze Token must be configured in the aiRouter cloud function environment.')
  },

  setCozeBots(bots = {}) {
    const nextBots = this.compactObject(bots)
    this.globalData.cozeConfig.bots = nextBots
    if (this.globalData.aiConfig.providers && this.globalData.aiConfig.providers.coze) {
      this.globalData.aiConfig.providers.coze.bots = nextBots
    }
    wx.setStorageSync('cozeBots', nextBots)
  },

  setXfyunConfig() {
    wx.removeStorageSync('xfyunConfig')
    console.warn('Xfyun credentials must be configured in the aiRouter cloud function environment.')
  },

  checkLoginStatus() {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')
    const openId = wx.getStorageSync('openId')

    if (token && userInfo && openId) {
      this.globalData.isLoggedIn = true
      this.globalData.userInfo = userInfo
      this.globalData.openId = openId
      this.globalData.token = token
    }
  },

  wxLogin() {
    return new Promise((resolve, reject) => {
      wx.showLoading({ title: '登录中...' })
      this.requestUserProfile(resolve, reject)
    })
  },

  requestUserProfile(resolve, reject) {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: res => {
        this.requestWxLoginCode(res.userInfo, resolve, reject)
      },
      fail: error => {
        console.error('getUserProfile failed:', error)

        if (this.isTestOrDevelopEnv()) {
          this.handleLogin(`mock_code_${Date.now()}`, this.getMockUserInfo(), resolve, reject)
          wx.showToast({ title: '已使用测试身份登录', icon: 'none' })
          return
        }

        this.finishLoginWithError(error, reject, '需要授权后才能使用')
      }
    })
  },

  requestWxLoginCode(userInfo, resolve, reject) {
    wx.login({
      success: res => {
        if (res.code) {
          this.handleLogin(res.code, userInfo, resolve, reject)
        } else {
          this.finishLoginWithError(new Error(`登录失败：${res.errMsg}`), reject)
        }
      },
      fail: error => this.finishLoginWithError(error, reject)
    })
  },

  async handleLogin(code, userInfo, resolve, reject) {
    try {
      const openId = await this.getOpenIdFromCloud()
      const data = {
        openId,
        token: `wx_session_${openId}`,
        userInfo,
        code
      }

      wx.setStorageSync('token', data.token)
      wx.setStorageSync('userInfo', userInfo)
      wx.setStorageSync('openId', openId)

      this.globalData.isLoggedIn = true
      this.globalData.userInfo = userInfo
      this.globalData.openId = openId
      this.globalData.token = data.token

      wx.hideLoading()
      wx.showToast({ title: '登录成功', icon: 'success' })
      resolve(data)
    } catch (error) {
      this.finishLoginWithError(error, reject, '请先联网完成身份初始化')
    }
  },

  async getOpenIdFromCloud() {
    if (!wx.cloud || !wx.cloud.callFunction) {
      throw new Error('Cloud functions are not available')
    }

    const res = await wx.cloud.callFunction({ name: 'getOpenId' })
    const openId = res && res.result && res.result.openid
    if (!openId) throw new Error('OpenId is empty')
    return openId
  },

  finishLoginWithError(error, reject, toastTitle) {
    wx.hideLoading()
    if (toastTitle) wx.showToast({ title: toastTitle, icon: 'none' })
    reject(error)
  },

  isTestOrDevelopEnv() {
    const envVersion = this.getEnvVersion()
    return envVersion === 'develop' || envVersion === 'trial'
  },

  getMockUserInfo() {
    return {
      nickName: '测试用户',
      avatarUrl: '',
      gender: 0,
      language: 'zh_CN',
      city: '',
      province: '',
      country: 'China'
    }
  },

  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo
    this.globalData.isLoggedIn = true
    wx.setStorageSync('userInfo', userInfo)
  },

  logout() {
    this.globalData.userInfo = null
    this.globalData.isLoggedIn = false
    this.globalData.openId = null
    this.globalData.token = null

    wx.removeStorageSync('token')
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('openId')

    wx.showToast({ title: '已退出登录', icon: 'success' })
  }
})
