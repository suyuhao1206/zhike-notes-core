// pages/config/config.js
const api = require('../../api/api.js');

Page({
  data: {
    cozeToken: '',
    xfyun: {
      appId: '',
      apiKey: '',
      apiSecret: ''
    },
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
    this.loadConfig();
  },

  // 加载配置
  loadConfig() {
    const app = getApp();
    const config = app.globalData.cozeConfig;
    const xfyunConfig = app.globalData.xfyunConfig || {};

    this.setData({
      cozeToken: config.token,
      bots: { ...config.bots },
      xfyun: {
        appId: xfyunConfig.appId || '',
        apiKey: xfyunConfig.apiKey || '',
        apiSecret: xfyunConfig.apiSecret || ''
      }
    });
  },

  // Token输入
  onTokenInput(e) {
    this.setData({ cozeToken: e.detail.value });
  },

  // Bot ID输入
  onBotInput(e) {
    const botType = e.currentTarget.dataset.type;
    this.setData({
      [`bots.${botType}`]: e.detail.value
    });
  },

  onXfyunInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`xfyun.${field}`]: e.detail.value
    });
  },

  // 保存配置
  saveConfig() {
    const app = getApp();

    // 保存到全局
    app.setCozeToken(this.data.cozeToken);
    app.setCozeBots(this.data.bots);
    app.setXfyunConfig(this.data.xfyun);

    wx.showToast({
      title: '保存成功',
      icon: 'success'
    });

    // 返回上一页
    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
  },

  // 测试连接
  async testConnection() {
    if (!this.data.cozeToken) {
      wx.showToast({
        title: '请先填写Token',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '测试中...' });

    try {
      // 临时保存配置
      const app = getApp();
      const originalToken = app.globalData.cozeConfig.token;
      app.globalData.cozeConfig.token = this.data.cozeToken;

      // 测试调用
      const result = await api.askQuestion('你好');

      // 恢复原始配置
      app.globalData.cozeConfig.token = originalToken;

      wx.hideLoading();
      wx.showModal({
        title: '测试成功',
        content: 'API连接正常！\n\n返回结果：' + JSON.stringify(result).substring(0, 100) + '...',
        showCancel: false
      });
    } catch (error) {
      wx.hideLoading();
      wx.showModal({
        title: '测试失败',
        content: '错误信息：' + error.message,
        showCancel: false
      });
    }
  },

  // 查看帮助
  showHelp() {
    wx.showModal({
      title: '配置帮助',
      content: `1. 获取 Coze Token：
   - 访问 https://www.coze.cn
   - 进入"个人设置" -> "开发者令牌"
   - 创建并复制 Token

2. 获取 Coze Bot ID：
   - 在 Coze 平台创建 Bot
   - 进入 Bot 详情页
   - 复制 Bot ID

3. 获取讯飞密钥：
   - 登录讯飞开放平台
   - 开通录音文件转写服务
   - 复制 APPID、APIKey、APISecret

4. 将以上信息填入对应位置即可。
   讯飞录音转写现在直接走前端配置，不再依赖云函数环境变量`,
      showCancel: false
    });
  }
});
