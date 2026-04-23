// pages/profile/profile.js
Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    stats: {
      totalNotes: 0,
      totalCourses: 0,
      studyHours: 0,
      qaCount: 0
    },
    menuList: [
      { id: 'notes', name: '我的笔记', icon: '📝', count: 0 },
      { id: 'courses', name: '课程管理', icon: '📚', count: 0 },
      { id: 'mistakes', name: '错题本', icon: '❌', count: 0 },
      { id: 'ocr', name: '拍图识别', icon: '📷', count: 0 },
      { id: 'flashcards', name: '背诵卡片', icon: '🃏', count: 0 }
    ],
    settings: [
      { id: 'backup', name: '数据备份', icon: '💾', value: '导出/导入' },
      { id: 'reminder', name: '学习提醒', icon: '⏰', enabled: false },
      { id: 'sync', name: '数据同步', icon: '🔄', enabled: true },
      { id: 'theme', name: '主题设置', icon: '🎨', value: '默认' }
    ]
  },

  onLoad() {
    this.loadUserData();
  },

  onShow() {
    this.loadUserData();
  },

  // 加载用户数据
  async loadUserData() {
    const app = getApp();

    // 获取登录状态
    this.setData({
      isLoggedIn: app.globalData.isLoggedIn,
      userInfo: app.globalData.userInfo
    });

    if (app.globalData.isLoggedIn) {
      // 加载统计数据
      await this.loadStats();
    }
  },

  // 加载统计数据
  async loadStats() {
    // 从本地存储获取真实数据
    const notes = wx.getStorageSync('notes') || [];
    const courses = wx.getStorageSync('courses') || [];
    const mistakes = wx.getStorageSync('mistakes') || [];
    const qaHistory = wx.getStorageSync('qa_history_general') || [];

    // 计算学习时长（从笔记中估算）
    const totalDuration = notes.reduce((sum, note) => sum + (note.duration || 0), 0);
    const studyHours = Math.round(totalDuration / 3600 * 10) / 10;

    const stats = {
      totalNotes: notes.length,
      totalCourses: courses.length,
      studyHours: studyHours || 0.5,
      qaCount: qaHistory.length
    };

    const menuList = this.data.menuList.map(item => {
      if (item.id === 'notes') item.count = stats.totalNotes;
      if (item.id === 'courses') item.count = stats.totalCourses;
      if (item.id === 'mistakes') item.count = mistakes.length;
      return item;
    });

    this.setData({ stats, menuList });
  },

  // 微信登录
  async wxLogin() {
    const app = getApp();

    try {
      await app.wxLogin();

      // 刷新页面数据
      this.setData({
        isLoggedIn: app.globalData.isLoggedIn,
        userInfo: app.globalData.userInfo
      });

      // 加载统计数据
      await this.loadStats();
    } catch (error) {
      console.error('登录失败:', error);
    }
  },

  // 进入菜单项
  goToMenu(e) {
    const menuId = e.currentTarget.dataset.id;

    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    switch(menuId) {
      case 'notes':
        wx.navigateTo({ url: '/pages/notes/notes' });
        break;
      case 'courses':
        wx.navigateTo({ url: '/pages/courses/courses' });
        break;
      case 'mistakes':
        wx.navigateTo({ url: '/pages/mistakes/mistakes' });
        break;
      case 'ocr':
        wx.navigateTo({ url: '/pages/ocr/ocr' });
        break;
      case 'flashcards':
        wx.navigateTo({ url: '/pages/flashcard/flashcard' });
        break;
    }
  },

  // 设置项点击
  toggleSetting(e) {
    const settingId = e.currentTarget.dataset.id;

    if (settingId === 'backup') {
      wx.navigateTo({ url: '/pages/backup/backup' });
    } else if (settingId === 'reminder') {
      wx.showToast({ title: '学习提醒功能开发中', icon: 'none' });
    } else if (settingId === 'sync') {
      wx.showToast({ title: '数据同步功能开发中', icon: 'none' });
    } else if (settingId === 'theme') {
      wx.showToast({ title: '主题设置功能开发中', icon: 'none' });
    }
  },

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '提示',
      content: '确定要清除所有缓存数据吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorage({
            success: () => {
              const app = getApp();
              app.logout();
              this.loadUserData();
            }
          });
        }
      }
    });
  },

  // 退出登录
  logout() {
    const app = getApp();
    app.logout();

    this.setData({
      isLoggedIn: false,
      userInfo: null,
      stats: {
        totalNotes: 0,
        totalCourses: 0,
        studyHours: 0,
        qaCount: 0
      }
    });
  },

  // 关于我们
  showAbout() {
    wx.showModal({
      title: '关于智课笔记',
      content: '智课笔记 v1.0\n基于大语言模型的智能笔记与答疑平台\n\n开发者：AI-GROUP-20\n© 2026',
      showCancel: false
    });
  },

  // 帮助中心
  goToHelp() {
    wx.navigateTo({ url: '/pages/help/help' });
  },

  // 云存储管理
  goToCloudStorage() {
    wx.navigateTo({ url: '/pages/cloud-storage/cloud-storage' });
  },

  // API配置
  goToConfig() {
    wx.navigateTo({ url: '/pages/config/config' });
  },

  // 清理重复数据
  async cleanupDuplicates() {
    wx.showModal({
      title: '清理重复数据',
      content: '检测并清理重复的课程数据，保留最新的。是否继续？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '清理中...', mask: true });
          
          try {
            const courses = wx.getStorageSync('courses') || [];
            
            const seenNames = new Map();
            const uniqueCourses = [];
            let removedCount = 0;
            
            for (const course of courses) {
              const name = course.name;
              
              if (!seenNames.has(name)) {
                seenNames.set(name, course);
                uniqueCourses.push(course);
              } else {
                const existing = seenNames.get(name);
                const existingTime = new Date(existing.createTime || existing.updateTime || 0).getTime();
                const currentTime = new Date(course.createTime || course.updateTime || 0).getTime();
                
                if (currentTime > existingTime) {
                  const index = uniqueCourses.findIndex(c => c.name === name);
                  uniqueCourses[index] = course;
                  seenNames.set(name, course);
                  removedCount++;
                } else {
                  removedCount++;
                }
              }
            }
            
            wx.setStorageSync('courses', uniqueCourses);
            wx.hideLoading();
            
            wx.showModal({
              title: '清理完成',
              content: `原有：${courses.length}个课程\n清理：${removedCount}个重复\n保留：${uniqueCourses.length}个课程`,
              showCancel: false,
              success: () => {
                this.loadStats();
              }
            });
            
          } catch (error) {
            wx.hideLoading();
            wx.showToast({ title: '清理失败', icon: 'none' });
          }
        }
      }
    });
  }
})
