class SmartStorage {
  constructor() {
    this.isOnline = true;
    this.pendingQueue = [];
    this.cloudEnabled = false;
    this.db = null;
    this.syncInProgress = false;
  }

  async init() {
    try {
      wx.onNetworkStatusChange((res) => {
        const wasOffline = !this.isOnline;
        this.isOnline = res.isConnected;
        
        if (wasOffline && this.isOnline && this.pendingQueue.length > 0) {
          wx.showToast({
            title: '网络已恢复，开始同步',
            icon: 'none'
          });
          setTimeout(() => this.syncPendingData(), 1000);
        }
      });

      const networkRes = await wx.getNetworkType();
      this.isOnline = networkRes.networkType !== 'none';

      if (typeof wx !== 'undefined' && wx.cloud) {
        await wx.cloud.init({
          env: 'cloud1-6gegqlssbeb8ee83',
          traceUser: true
        });
        this.db = wx.cloud.database();
        this.cloudEnabled = true;
        console.log('✅ 云存储初始化成功');
      }

      this.pendingQueue = wx.getStorageSync('pendingQueue') || [];
      
      if (this.pendingQueue.length > 0 && this.isOnline && this.cloudEnabled) {
        wx.showModal({
          title: '数据同步',
          content: `有 ${this.pendingQueue.length} 条数据待同步，是否立即同步？`,
          confirmText: '立即同步',
          cancelText: '稍后',
          success: (res) => {
            if (res.confirm) {
              this.syncPendingData();
            }
          }
        });
      }

    } catch (error) {
      console.error('云存储初始化失败:', error);
      this.cloudEnabled = false;
    }
  }

  async save(collection, data) {
    const timestamp = Date.now();
    const userId = await this.getUserId();
    
    const doc = {
      ...data,
      userId: userId,
      createTime: data.createTime || timestamp,
      updateTime: timestamp,
      version: (data.version || 0) + 1,
      cloudSynced: false
    };

    this.saveLocal(collection, doc);

    if (this.cloudEnabled && this.isOnline) {
      try {
        const result = await this.saveCloud(collection, doc);
        doc._id = result._id;
        doc.cloudSynced = true;
        this.updateLocal(collection, doc);
        
        console.log('✅ 云端保存成功:', collection, doc.id || doc._id);
        return { success: true, location: 'cloud', data: doc };
      } catch (error) {
        console.warn('⚠️ 云端保存失败，已保存到本地:', error.message);
        this.addToPendingQueue(collection, doc, 'save');
      }
    } else {
      this.addToPendingQueue(collection, doc, 'save');
      console.log('📱 离线模式：数据已保存到本地');
    }

    return { success: true, location: 'local', data: doc };
  }

  async get(collection, id) {
    if (this.cloudEnabled && this.isOnline) {
      try {
        const cloudData = await this.getCloud(collection, id);
        if (cloudData) {
          this.updateLocal(collection, cloudData);
          return { data: cloudData, source: 'cloud' };
        }
      } catch (error) {
        console.warn('云端获取失败，使用本地数据:', error.message);
      }
    }

    const localData = this.getLocal(collection, id);
    return { data: localData, source: 'local' };
  }

  async list(collection, options = {}) {
    const { where = {}, orderBy = 'updateTime', order = 'desc', limit = 100, skip = 0 } = options;

    if (this.cloudEnabled && this.isOnline) {
      try {
        const userId = await this.getUserId();
        let query = this.db.collection(collection).where({ userId, ...where });
        
        if (orderBy) {
          query = query.orderBy(orderBy, order);
        }
        
        const res = await query.skip(skip).limit(limit).get();
        
        if (res.data && res.data.length > 0) {
          this.syncListToLocal(collection, res.data);
          return { data: res.data, source: 'cloud' };
        }
      } catch (error) {
        console.warn('云端查询失败，使用本地数据:', error.message);
      }
    }

    const localList = this.listFromLocal(collection, where);
    return { data: localList, source: 'local' };
  }

  async update(collection, id, data) {
    const doc = {
      ...data,
      updateTime: Date.now(),
      version: (data.version || 0) + 1,
      cloudSynced: false
    };

    this.updateLocal(collection, id, doc);

    if (this.cloudEnabled && this.isOnline) {
      try {
        if (id && id.startsWith('cloud_')) {
          await this.db.collection(collection).doc(id).update({ data: doc });
          doc.cloudSynced = true;
          this.updateLocal(collection, id, doc);
          return { success: true, location: 'cloud' };
        }
      } catch (error) {
        console.warn('云端更新失败:', error.message);
        this.addToPendingQueue(collection, { ...doc, _id: id }, 'update');
      }
    } else {
      this.addToPendingQueue(collection, { ...doc, _id: id }, 'update');
    }

    return { success: true, location: 'local' };
  }

  async remove(collection, id) {
    this.removeFromLocal(collection, id);

    if (this.cloudEnabled && this.isOnline && id) {
      try {
        await this.db.collection(collection).doc(id).remove();
        return { success: true, location: 'cloud' };
      } catch (error) {
        console.warn('云端删除失败:', error.message);
      }
    }

    return { success: true, location: 'local' };
  }

  async syncPendingData() {
    if (this.syncInProgress || this.pendingQueue.length === 0) return;

    this.syncInProgress = true;
    wx.showLoading({ title: '同步中...', mask: true });

    const failedItems = [];
    let successCount = 0;

    for (const item of this.pendingQueue) {
      try {
        if (item.action === 'save' || item.action === 'update') {
          const result = await this.saveCloud(item.collection, item.data);
          item.data._id = result._id;
          item.data.cloudSynced = true;
          this.updateLocal(item.collection, item.data);
          successCount++;
        }
      } catch (error) {
        console.error('同步失败:', error);
        failedItems.push(item);
      }
    }

    this.pendingQueue = failedItems;
    wx.setStorageSync('pendingQueue', this.pendingQueue);

    this.syncInProgress = false;
    wx.hideLoading();

    if (successCount > 0) {
      wx.showToast({
        title: `成功同步 ${successCount} 条数据`,
        icon: 'success'
      });
    }

    if (failedItems.length > 0) {
      wx.showModal({
        title: '部分数据同步失败',
        content: `${failedItems.length} 条数据同步失败，将在下次网络恢复时重试`,
        showCancel: false
      });
    }

    this.saveSyncHistory({
      type: 'upload',
      count: successCount,
      success: failedItems.length === 0
    });
  }

  async syncAllToCloud() {
    if (!this.cloudEnabled || !this.isOnline) {
      wx.showToast({ title: '网络不可用', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '上传数据中...', mask: true });

    const collections = ['courses', 'notes', 'mistakes', 'flashcards'];
    let totalSynced = 0;

    for (const collection of collections) {
      const localList = wx.getStorageSync(collection) || [];
      
      for (const item of localList) {
        if (!item.cloudSynced) {
          try {
            await this.saveCloud(collection, item);
            item.cloudSynced = true;
            totalSynced++;
          } catch (error) {
            console.error(`同步 ${collection} 失败:`, error);
          }
        }
      }
      
      wx.setStorageSync(collection, localList);
    }

    wx.hideLoading();
    
    wx.showToast({
      title: `已上传 ${totalSynced} 条数据`,
      icon: 'success'
    });

    this.saveSyncHistory({
      type: 'upload',
      count: totalSynced,
      success: true
    });
  }

  async downloadFromCloud() {
    if (!this.cloudEnabled || !this.isOnline) {
      wx.showToast({ title: '网络不可用', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '下载云端数据',
      content: '这将覆盖本地数据，是否继续？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '下载中...', mask: true });

          const collections = ['courses', 'notes', 'mistakes', 'flashcards'];
          let totalDownloaded = 0;

          for (const collection of collections) {
            try {
              const userId = await this.getUserId();
              const res = await this.db.collection(collection)
                .where({ userId })
                .limit(100)
                .get();

              if (res.data && res.data.length > 0) {
                const dataWithFlag = res.data.map(item => ({
                  ...item,
                  cloudSynced: true
                }));
                wx.setStorageSync(collection, dataWithFlag);
                totalDownloaded += res.data.length;
              }
            } catch (error) {
              console.error(`下载 ${collection} 失败:`, error);
            }
          }

          wx.hideLoading();
          
          wx.showToast({
            title: `已下载 ${totalDownloaded} 条数据`,
            icon: 'success'
          });

          this.saveSyncHistory({
            type: 'download',
            count: totalDownloaded,
            success: true
          });
        }
      }
    });
  }

  async saveCloud(collection, doc) {
    if (doc._id) {
      await this.db.collection(collection).doc(doc._id).set({ data: doc });
      return { _id: doc._id };
    } else {
      const result = await this.db.collection(collection).add({ data: doc });
      return { _id: result._id };
    }
  }

  async getCloud(collection, id) {
    const res = await this.db.collection(collection).doc(id).get();
    return res.data;
  }

  saveLocal(collection, doc) {
    const key = collection;
    let list = wx.getStorageSync(key) || [];
    
    const index = list.findIndex(item => 
      (item._id && item._id === doc._id) || 
      (item.id && item.id === doc.id)
    );
    
    if (index > -1) {
      list[index] = { ...list[index], ...doc };
    } else {
      list.unshift(doc);
    }
    
    wx.setStorageSync(key, list);
  }

  updateLocal(collection, doc) {
    this.saveLocal(collection, doc);
  }

  getLocal(collection, id) {
    const list = wx.getStorageSync(collection) || [];
    return list.find(item => 
      (item._id && item._id === id) || 
      (item.id && item.id === id)
    );
  }

  listFromLocal(collection, where = {}) {
    let list = wx.getStorageSync(collection) || [];
    
    if (Object.keys(where).length > 0) {
      list = list.filter(item => {
        return Object.keys(where).every(k => {
          if (k === 'userId') return true;
          return item[k] === where[k];
        });
      });
    }
    
    return list;
  }

  removeFromLocal(collection, id) {
    let list = wx.getStorageSync(collection) || [];
    list = list.filter(item => 
      (item._id && item._id !== id) && 
      (item.id && item.id !== id)
    );
    wx.setStorageSync(collection, list);
  }

  syncListToLocal(collection, docs) {
    const localMap = new Map();
    const existingList = wx.getStorageSync(collection) || [];
    
    existingList.forEach(item => {
      const id = item._id || item.id;
      localMap.set(id, item);
    });
    
    docs.forEach(doc => {
      const id = doc._id || doc.id;
      localMap.set(id, { ...doc, cloudSynced: true });
    });
    
    const mergedList = Array.from(localMap.values()).sort((a, b) => {
      return new Date(b.updateTime) - new Date(a.updateTime);
    });
    
    wx.setStorageSync(collection, mergedList);
  }

  addToPendingQueue(collection, data, action) {
    const exists = this.pendingQueue.some(item => 
      item.collection === collection && 
      (item.data._id === data._id || item.data.id === data.id)
    );

    if (!exists) {
      this.pendingQueue.push({
        collection,
        data,
        action,
        timestamp: Date.now()
      });
      wx.setStorageSync('pendingQueue', this.pendingQueue);
    }
  }

  async getUserId() {
    let openId = wx.getStorageSync('openId');
    
    if (!openId && this.cloudEnabled) {
      try {
        const res = await wx.cloud.callFunction({ name: 'getOpenId' });
        openId = res.result.openid;
        wx.setStorageSync('openId', openId);
      } catch (error) {
        console.warn('获取用户ID失败:', error);
        openId = 'local_user_' + Date.now();
        wx.setStorageSync('openId', openId);
      }
    } else if (!openId) {
      openId = 'local_user_' + Date.now();
      wx.setStorageSync('openId', openId);
    }
    
    return openId;
  }

  async getStorageStats() {
    const stats = {
      cloud: {
        enabled: this.cloudEnabled,
        online: this.isOnline,
        courses: 0,
        notes: 0,
        mistakes: 0,
        flashcards: 0
      },
      local: {
        courses: 0,
        notes: 0,
        mistakes: 0,
        flashcards: 0,
        currentSize: 0,
        limitSize: 10240
      },
      pendingSync: this.pendingQueue.length
    };

    if (this.cloudEnabled && this.isOnline) {
      try {
        const userId = await this.getUserId();
        const db = wx.cloud.database();
        
        for (const col of ['courses', 'notes', 'mistakes', 'flashcards']) {
          const countRes = await db.collection(col).where({ userId }).count();
          stats.cloud[col] = countRes.total;
        }
      } catch (error) {
        console.error('获取云端统计失败:', error);
      }
    }

    for (const col of ['courses', 'notes', 'mistakes', 'flashcards']) {
      const list = wx.getStorageSync(col) || [];
      stats.local[col] = list.length;
    }

    try {
      const storageInfo = await wx.getStorageInfo();
      stats.local.currentSize = storageInfo.currentSize;
      stats.local.limitSize = storageInfo.limitSize;
    } catch (error) {
      console.error('获取存储信息失败:', error);
    }

    return stats;
  }

  saveSyncHistory(record) {
    const history = wx.getStorageSync('syncHistory') || [];
    history.unshift({
      ...record,
      timestamp: Date.now(),
      time: new Date().toLocaleString('zh-CN')
    });
    
    if (history.length > 20) {
      history.pop();
    }
    
    wx.setStorageSync('syncHistory', history);
  }

  getSyncHistory() {
    return wx.getStorageSync('syncHistory') || [];
  }
}

module.exports = new SmartStorage();
