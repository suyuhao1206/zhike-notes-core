// pages/welcome/welcome.js
Page({
  data: {
    currentStep: 0,
    steps: [
      {
        title: '欢迎来到智课笔记',
        desc: '基于大语言模型的智能学习助手',
        icon: '📚'
      },
      {
        title: '录音转文字',
        desc: '课堂录音自动转写成笔记，再也不怕漏听重点',
        icon: '🎙️'
      },
      {
        title: 'AI智能答疑',
        desc: '基于笔记内容，AI为你答疑解惑',
        icon: '🤖'
      },
      {
        title: '智能复习',
        desc: '自动生成复习卷、错题本，高效复习',
        icon: '📝'
      }
    ]
  },

  onLoad() {
    // 检查是否是首次使用
    const hasSeenWelcome = wx.getStorageSync('has_seen_welcome');
    if (hasSeenWelcome) {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  // 下一步
  nextStep() {
    if (this.data.currentStep < this.data.steps.length - 1) {
      this.setData({ currentStep: this.data.currentStep + 1 });
    } else {
      this.enterApp();
    }
  },

  // 跳过引导
  skipWelcome() {
    this.enterApp();
  },

  // 进入应用
  enterApp() {
    wx.setStorageSync('has_seen_welcome', true);
    wx.switchTab({ url: '/pages/index/index' });
  }
});
