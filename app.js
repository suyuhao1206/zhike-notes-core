const internalAIConfig = require('./config/ai.config.js');
const DB = require('./utils/db.js');
const { getOrchestrator } = require('./core/orchestrator')
const { getAIService } = require('./services/aiService')

App({
  onLaunch() {
    console.log('🚀 智课笔记启动中...')
    
    if (wx.cloud) {
      wx.cloud.init({
        env: 'REDACTED_CLOUD_ENV',
        traceUser: true
      });
      console.log('✅ 云开发环境初始化成功');
      
      DB.init();
    } else {
      console.warn('请使用 2.2.3 或以上的基础库以使用云能力');
    }

    this.checkLoginStatus();

    this.initAIConfig();
    
    // 延迟初始化新架构，避免阻塞启动
    setTimeout(() => {
      this.initNewArchitecture().catch(err => {
        console.error('新架构初始化失败:', err);
      });
    }, 100);
  },

  globalData: {
    userInfo: null,
    isLoggedIn: false,
    openId: null,
    token: null,
    aiConfig: {
      provider: 'coze',
      providers: {
        coze: {
          baseUrl: 'https://api.coze.cn/v1',
          apiKey: '',
          bots: {
            noteSummary: '',
            qaAssistant: '',
            examGenerator: '',
            flashcardGen: '',
            ocrVision: '',
            audioTranscribe: ''
          }
        },
        xfyun: {
          appId: '',
          apiKey: '',
          apiSecret: '',
          baseUrl: 'https://office-api-ist-dx.iflyaisol.com'
        },
        openai: {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: '',
          model: 'gpt-4o-mini'
        },
        compatible: {
          baseUrl: '',
          apiKey: '',
          model: ''
        }
      }
    },
    cozeConfig: {
      baseUrl: 'https://api.coze.cn/v1',
      token: '',  // 需要配置你的 Coze Token
      bots: {
        noteSummary: '',  // 笔记总结 Bot ID
        qaAssistant: '',  // 答疑助手 Bot ID
        examGenerator: '', // 试卷生成 Bot ID
        flashcardGen: '',  // 卡片生成 Bot ID
        ocrVision: '',     // 图片识别 Bot ID
        audioTranscribe: '' // 录音转写 Bot ID
      }
    },
    xfyunConfig: {
      appId: '',
      apiKey: '',
      apiSecret: '',
      baseUrl: 'https://office-api-ist-dx.iflyaisol.com'
    }
  },

  // 获取当前运行环境
  getEnvVersion() {
    try {
      const accountInfo = wx.getAccountInfoSync && wx.getAccountInfoSync();
      return (accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion) || 'develop';
    } catch (e) {
      return 'develop';
    }
  },

  // 初始化 AI 配置
  initAIConfig() {
    const envVersion = this.getEnvVersion();
    const envConfig = internalAIConfig.getAIConfigByEnv(envVersion);
    this.globalData.aiConfig = envConfig;

    // 开发/体验环境允许本地覆写，正式环境强制使用内置配置
    const canUseRuntimeOverride = envVersion === 'develop' || envVersion === 'trial';

    const cozeToken = wx.getStorageSync('cozeToken');
    const cozeBots = wx.getStorageSync('cozeBots');
    const xfyunConfig = wx.getStorageSync('xfyunConfig');
    const aiConfig = wx.getStorageSync('aiConfig');

    if (canUseRuntimeOverride && aiConfig && aiConfig.providers) {
      this.globalData.aiConfig = this.mergeAIConfig(envConfig, aiConfig);
    }

    if (cozeToken) {
      this.globalData.cozeConfig.token = cozeToken;
      this.globalData.aiConfig.providers.coze.apiKey = cozeToken;
    }
    if (cozeBots) {
      const savedBots = Object.keys(cozeBots).reduce((result, key) => {
        if (cozeBots[key]) result[key] = cozeBots[key];
        return result;
      }, {});
      const mergedBots = {
        ...(this.globalData.aiConfig.providers.coze.bots || {}),
        ...savedBots
      };
      this.globalData.cozeConfig.bots = mergedBots;
      this.globalData.aiConfig.providers.coze.bots = mergedBots;
    }

    if (xfyunConfig && (xfyunConfig.appId || xfyunConfig.apiKey || xfyunConfig.apiSecret)) {
      const normalizedXfyunConfig = this.normalizeXfyunConfig(xfyunConfig);
      const mergedXfyunConfig = {
        ...(this.globalData.aiConfig.providers.xfyun || {}),
        ...normalizedXfyunConfig
      };
      this.globalData.xfyunConfig = mergedXfyunConfig;
      this.globalData.aiConfig.providers.xfyun = mergedXfyunConfig;
      wx.setStorageSync('xfyunConfig', mergedXfyunConfig);
      wx.setStorageSync('aiConfig', this.globalData.aiConfig);
    }

    // 同步 cozeConfig 与 aiConfig.coze，避免旧代码失效
    this.syncCozeConfigFromAI();
    this.syncXfyunConfigFromAI();
  },

  mergeAIConfig(baseConfig, runtimeConfig) {
    const merged = {
      ...baseConfig,
      ...runtimeConfig,
      providers: {
        ...(baseConfig.providers || {}),
        ...(runtimeConfig.providers || {})
      }
    };
    return merged;
  },

  normalizeXfyunConfig(config = {}) {
    return { ...config };
  },

  maskSecret(value = '', left = 4, right = 4) {
    const text = String(value || '');
    if (!text) return '(empty)';
    if (text.length <= left + right) return `${text.slice(0, 1)}***${text.slice(-1)}`;
    return `${text.slice(0, left)}***${text.slice(-right)}`;
  },

  syncCozeConfigFromAI() {
    const cozeProvider = this.globalData.aiConfig.providers.coze || {};
    this.globalData.cozeConfig.baseUrl = cozeProvider.baseUrl || 'https://api.coze.cn/v1';
    this.globalData.cozeConfig.token = cozeProvider.apiKey || '';
    this.globalData.cozeConfig.bots = cozeProvider.bots || {};
  },

  syncXfyunConfigFromAI() {
    const xfyunProvider = this.globalData.aiConfig.providers.xfyun || {};
    this.globalData.xfyunConfig = {
      appId: xfyunProvider.appId || '',
      apiKey: xfyunProvider.apiKey || '',
      apiSecret: xfyunProvider.apiSecret || '',
      baseUrl: xfyunProvider.baseUrl || 'https://office-api-ist-dx.iflyaisol.com'
    };

    console.log('🔐 当前讯飞配置摘要:', {
      appId: this.maskSecret(this.globalData.xfyunConfig.appId, 3, 2),
      apiKey: this.maskSecret(this.globalData.xfyunConfig.apiKey, 6, 4),
      apiSecret: this.maskSecret(this.globalData.xfyunConfig.apiSecret, 6, 4),
      baseUrl: this.globalData.xfyunConfig.baseUrl
    });
  },

  async initNewArchitecture() {
    try {
      console.log('📦 初始化新架构...')
      
      const aiService = getAIService()
      aiService.init(this.globalData.aiConfig)
      console.log('✅ AI服务初始化完成')

      const orchestrator = getOrchestrator()
      await orchestrator.init()
      console.log('✅ 编排器初始化完成')
      
      const capabilities = orchestrator.getAvailableCapabilities()
      console.log('📋 可用能力:', capabilities)
      
      const tools = orchestrator.getAvailableTools()
      console.log('🔧 可用工具:', tools)
      
      // 保存到全局，方便页面访问
      this.orchestrator = orchestrator
      
      console.log('✅ 新架构初始化完成')
    } catch (error) {
      console.error('❌ 新架构初始化失败:', error)
      console.log('💡 提示: 新架构初始化失败不影响基础功能使用')
    }
  },

  setAIConfig(config) {
    this.globalData.aiConfig = config;
    wx.setStorageSync('aiConfig', config);
    this.syncCozeConfigFromAI();
    this.syncXfyunConfigFromAI();
  },

  // 设置 Coze Token
  setCozeToken(token) {
    this.globalData.cozeConfig.token = token;
    this.globalData.aiConfig.providers.coze.apiKey = token;
    wx.setStorageSync('aiConfig', this.globalData.aiConfig);
    wx.setStorageSync('cozeToken', token);
  },

  // 设置 Coze Bot IDs
  setCozeBots(bots) {
    this.globalData.cozeConfig.bots = bots;
    this.globalData.aiConfig.providers.coze.bots = bots;
    wx.setStorageSync('aiConfig', this.globalData.aiConfig);
    wx.setStorageSync('cozeBots', bots);
  },

  setXfyunConfig(config = {}) {
    const hasCustomValue = !!(config.appId || config.apiKey || config.apiSecret);
    const normalizedConfig = this.normalizeXfyunConfig(config);
    const nextConfig = {
      ...(this.globalData.aiConfig.providers.xfyun || {}),
      ...(hasCustomValue ? normalizedConfig : {}),
      baseUrl: normalizedConfig.baseUrl || (this.globalData.aiConfig.providers.xfyun || {}).baseUrl || 'https://office-api-ist-dx.iflyaisol.com'
    };
    this.globalData.xfyunConfig = nextConfig;
    this.globalData.aiConfig.providers.xfyun = nextConfig;
    wx.setStorageSync('aiConfig', this.globalData.aiConfig);
    if (hasCustomValue) {
      wx.setStorageSync('xfyunConfig', nextConfig);
    } else {
      wx.removeStorageSync('xfyunConfig');
    }
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    const openId = wx.getStorageSync('openId');

    if (token && userInfo) {
      this.globalData.isLoggedIn = true;
      this.globalData.userInfo = userInfo;
      this.globalData.openId = openId;
      this.globalData.token = token;
    }
  },

  // 微信登录
  wxLogin() {
    return new Promise((resolve, reject) => {
      wx.showLoading({ title: '登录中...' });

      // 注意：getUserProfile 必须由用户点击手势直接触发
      this.requestUserProfile(resolve, reject);
    });
  },

  // 获取用户信息（必须在 tap 触发链路中调用）
  requestUserProfile(resolve, reject) {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        const userInfo = res.userInfo;
        this.requestWxLoginCode(userInfo, resolve, reject);
      },
      fail: (err) => {
        console.error('获取用户信息失败:', err);

        // 开发/体验环境允许免授权登录，避免调试被阻塞
        if (this.isTestOrDevelopEnv()) {
          const mockUser = this.getMockUserInfo();
          this.handleLogin(`mock_code_${Date.now()}`, mockUser, resolve, reject);
          wx.showToast({ title: '已使用测试身份登录', icon: 'none' });
          return;
        }

        this.finishLoginWithError(err, reject, '需要授权才能使用');
      }
    });
  },

  // 获取微信登录 code
  requestWxLoginCode(userInfo, resolve, reject) {
    wx.login({
      success: (res) => {
        if (res.code) {
          this.handleLogin(res.code, userInfo, resolve, reject);
        } else {
          this.finishLoginWithError(new Error('登录失败：' + res.errMsg), reject);
        }
      },
      fail: (err) => {
        this.finishLoginWithError(err, reject);
      }
    });
  },

  // 统一处理登录失败，避免 hideLoading 重复调用
  finishLoginWithError(error, reject, toastTitle) {
    wx.hideLoading();
    if (toastTitle) {
      wx.showToast({ title: toastTitle, icon: 'none' });
    }
    reject(error);
  },

  // 是否为开发/体验环境
  isTestOrDevelopEnv() {
    const envVersion = this.getEnvVersion();
    return envVersion === 'develop' || envVersion === 'trial';
  },

  // 测试用户信息（仅用于开发/体验环境）
  getMockUserInfo() {
    return {
      nickName: '测试用户',
      avatarUrl: '',
      gender: 0,
      language: 'zh_CN',
      city: '',
      province: '',
      country: 'China'
    };
  },

  // 处理登录
  handleLogin(code, userInfo, resolve, reject) {
    // 模拟服务器登录
    // TODO: 替换为真实的后端登录接口
    setTimeout(() => {
      const mockData = {
        openId: 'mock_openid_' + Date.now(),
        token: 'mock_token_' + Date.now(),
        userInfo: userInfo
      };

      // 保存到本地
      wx.setStorageSync('token', mockData.token);
      wx.setStorageSync('userInfo', userInfo);
      wx.setStorageSync('openId', mockData.openId);

      // 更新全局数据
      this.globalData.isLoggedIn = true;
      this.globalData.userInfo = userInfo;
      this.globalData.openId = mockData.openId;
      this.globalData.token = mockData.token;

      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
      resolve(mockData);
    }, 1000);

    /* 真实后端调用示例：
    wx.request({
      url: 'https://your-server.com/api/login',
      method: 'POST',
      data: {
        code: code,
        userInfo: userInfo
      },
      success: (res) => {
        if (res.data.code === 0) {
          const data = res.data.data;

          wx.setStorageSync('token', data.token);
          wx.setStorageSync('userInfo', userInfo);
          wx.setStorageSync('openId', data.openId);

          this.globalData.isLoggedIn = true;
          this.globalData.userInfo = userInfo;
          this.globalData.openId = data.openId;
          this.globalData.token = data.token;

          wx.hideLoading();
          wx.showToast({ title: '登录成功', icon: 'success' });
          resolve(data);
        } else {
          wx.hideLoading();
          reject(new Error(res.data.msg));
        }
      },
      fail: (err) => {
        wx.hideLoading();
        reject(err);
      }
    });
    */
  },

  // 设置用户信息
  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo;
    this.globalData.isLoggedIn = true;
    wx.setStorageSync('userInfo', userInfo);
  },

  // 退出登录
  logout() {
    this.globalData.userInfo = null;
    this.globalData.isLoggedIn = false;
    this.globalData.openId = null;
    this.globalData.token = null;

    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('openId');

    wx.showToast({ title: '已退出登录', icon: 'success' });
  }
})
