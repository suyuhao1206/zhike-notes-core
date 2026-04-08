const internalAIConfig = require('./config/ai.config.js');
const DB = require('./utils/db.js');

App({
  onLaunch() {
    // 小程序启动时执行
    console.log('智课笔记小程序启动');

    // 初始化云开发环境
    if (wx.cloud) {
      wx.cloud.init({
        env: '你的云开发环境ID', // 替换为你的云开发环境ID
        traceUser: true
      });
      console.log('云开发环境初始化成功');
      
      // 初始化数据库模块
      DB.init();
    } else {
      console.warn('请使用 2.2.3 或以上的基础库以使用云能力');
    }

    // 检查登录状态
    this.checkLoginStatus();

    // 初始化 AI 配置（默认 Coze，可扩展到 OpenAI 兼容接口）
    this.initAIConfig();
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
            flashcardGen: ''
          }
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
        flashcardGen: ''   // 卡片生成 Bot ID
      }
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
    const aiConfig = wx.getStorageSync('aiConfig');

    if (canUseRuntimeOverride && aiConfig && aiConfig.providers) {
      this.globalData.aiConfig = this.mergeAIConfig(envConfig, aiConfig);
    }

    if (cozeToken) {
      this.globalData.cozeConfig.token = cozeToken;
      this.globalData.aiConfig.providers.coze.apiKey = cozeToken;
    }
    if (cozeBots) {
      this.globalData.cozeConfig.bots = cozeBots;
      this.globalData.aiConfig.providers.coze.bots = cozeBots;
    }

    // 同步 cozeConfig 与 aiConfig.coze，避免旧代码失效
    this.syncCozeConfigFromAI();
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

  syncCozeConfigFromAI() {
    const cozeProvider = this.globalData.aiConfig.providers.coze || {};
    this.globalData.cozeConfig.baseUrl = cozeProvider.baseUrl || 'https://api.coze.cn/v1';
    this.globalData.cozeConfig.token = cozeProvider.apiKey || '';
    this.globalData.cozeConfig.bots = cozeProvider.bots || {};
  },

  setAIConfig(config) {
    this.globalData.aiConfig = config;
    wx.setStorageSync('aiConfig', config);
    this.syncCozeConfigFromAI();
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
