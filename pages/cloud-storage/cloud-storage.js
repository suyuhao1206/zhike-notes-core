const smartStorage = require('../../utils/smartStorage.js');

Page({
  data: {
    cloudEnabled: false,
    isOnline: true,
    pendingSync: 0,
    stats: {
      cloud: { courses: 0, notes: 0, mistakes: 0, flashcards: 0 },
      local: { courses: 0, notes: 0, mistakes: 0, flashcards: 0, currentSize: 0, limitSize: 10240 }
    },
    storagePercent: 0,
    localSize: '0',
    limitSize: '10',
    syncHistory: []
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    wx.showLoading({ title: '加载中...', mask: true });

    try {
      const stats = await smartStorage.getStorageStats();
      const syncHistory = smartStorage.getSyncHistory();
      
      const storagePercent = Math.round(
        (stats.local.currentSize / stats.local.limitSize) * 100
      );
      
      this.setData({
        cloudEnabled: stats.cloud.enabled,
        isOnline: stats.cloud.online,
        pendingSync: stats.pendingSync,
        stats: stats,
        storagePercent: storagePercent,
        localSize: (stats.local.currentSize / 1024).toFixed(2),
        limitSize: (stats.local.limitSize / 1024 / 1024).toFixed(0),
        syncHistory: syncHistory
      });

      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      console.error('加载数据失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async syncAll() {
    if (!this.data.isOnline) {
      wx.showToast({ title: '网络不可用', icon: 'none' });
      return;
    }

    if (!this.data.cloudEnabled) {
      wx.showModal({
        title: '云存储未启用',
        content: '请先配置云开发环境',
        showCancel: false
      });
      return;
    }

    wx.showModal({
      title: '同步所有数据',
      content: '将本地所有数据上传到云端，是否继续？',
      success: async (res) => {
        if (res.confirm) {
          await smartStorage.syncAllToCloud();
          this.loadData();
        }
      }
    });
  },

  async syncPending() {
    if (this.data.pendingSync === 0) {
      wx.showToast({ title: '没有待同步数据', icon: 'none' });
      return;
    }

    await smartStorage.syncPendingData();
    this.loadData();
  },

  async downloadFromCloud() {
    await smartStorage.downloadFromCloud();
    this.loadData();
  },

  exportData() {
    wx.showModal({
      title: '导出数据',
      content: '将所有数据导出为JSON文件，保存到本地',
      success: (res) => {
        if (res.confirm) {
          this.doExport();
        }
      }
    });
  },

  async doExport() {
    wx.showLoading({ title: '导出中...', mask: true });

    try {
      const data = {
        courses: wx.getStorageSync('courses') || [],
        notes: wx.getStorageSync('notes') || [],
        mistakes: wx.getStorageSync('mistakes') || [],
        flashcards: wx.getStorageSync('flashcards') || [],
        exportTime: new Date().toISOString(),
        version: '2.3.1'
      };

      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/zhike_backup_${Date.now()}.json`;
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

      wx.hideLoading();

      wx.showModal({
        title: '导出成功',
        content: `数据已导出到：${filePath}\n\n数据统计：\n- 课程：${data.courses.length}个\n- 笔记：${data.notes.length}篇\n- 错题：${data.mistakes.length}道`,
        showCancel: false
      });

    } catch (error) {
      wx.hideLoading();
      console.error('导出失败:', error);
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  importData() {
    wx.showModal({
      title: '导入数据',
      content: '从JSON文件导入数据，将覆盖现有数据',
      success: (res) => {
        if (res.confirm) {
          this.doImport();
        }
      }
    });
  },

  doImport() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        const filePath = res.tempFiles[0].path;
        
        wx.showLoading({ title: '导入中...', mask: true });

        const fs = wx.getFileSystemManager();
        const content = fs.readFileSync(filePath, 'utf8');
        
        try {
          const data = JSON.parse(content);

          if (data.courses) wx.setStorageSync('courses', data.courses);
          if (data.notes) wx.setStorageSync('notes', data.notes);
          if (data.mistakes) wx.setStorageSync('mistakes', data.mistakes);
          if (data.flashcards) wx.setStorageSync('flashcards', data.flashcards);

          wx.hideLoading();
          
          wx.showModal({
            title: '导入成功',
            content: `已导入数据：\n- 课程：${(data.courses || []).length}个\n- 笔记：${(data.notes || []).length}篇\n- 错题：${(data.mistakes || []).length}道`,
            showCancel: false,
            success: () => {
              this.loadData();
            }
          });

        } catch (error) {
          wx.hideLoading();
          console.error('解析文件失败:', error);
          wx.showToast({ title: '文件格式错误', icon: 'none' });
        }
      }
    });
  },

  clearLocalData() {
    wx.showModal({
      title: '清除本地数据',
      content: '此操作将删除所有本地数据，且不可恢复。是否继续？',
      confirmText: '确定清除',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.showToast({ title: '已清除', icon: 'success' });
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/index/index' });
          }, 1500);
        }
      }
    });
  },

  clearCloudData() {
    wx.showModal({
      title: '清除云端数据',
      content: '此操作将删除所有云端数据，且不可恢复。是否继续？',
      confirmText: '确定清除',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '清除中...', mask: true });

          try {
            const db = wx.cloud.database();
            const userId = await smartStorage.getUserId();

            for (const col of ['courses', 'notes', 'mistakes', 'flashcards']) {
              const res = await db.collection(col).where({ userId }).get();
              for (const doc of res.data) {
                await db.collection(col).doc(doc._id).remove();
              }
            }

            wx.hideLoading();
            wx.showToast({ title: '已清除云端数据', icon: 'success' });
            this.loadData();

          } catch (error) {
            wx.hideLoading();
            console.error('清除云端数据失败:', error);
            wx.showToast({ title: '清除失败', icon: 'none' });
          }
        }
      }
    });
  }
});
