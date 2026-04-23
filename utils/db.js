/**
 * 云优先存储引擎
 * 核心理念：云端是主力存储，本地是缓存和离线备份
 * 
 * 数据流向：用户操作 → 云端存储 → 本地缓存
 * 降级策略：仅在网络中断等不可抗力时使用本地
 */

const CloudFirstStorage = {
  isCloudReady: false,
  db: null,
  isOnline: true,
  
  async init() {
    try {
      // 监听网络状态
      wx.onNetworkStatusChange((res) => {
        this.isOnline = res.isConnected;
        console.log(`网络状态: ${res.isConnected ? '在线' : '离线'}`);
      });

      // 检查当前网络
      const networkRes = await wx.getNetworkType();
      this.isOnline = networkRes.networkType !== 'none';

      // 初始化云数据库
      if (typeof wx !== 'undefined' && wx.cloud) {
        await wx.cloud.init({
          env: 'REDACTED_CLOUD_ENV',
          traceUser: true
        });
        this.db = wx.cloud.database();
        this.isCloudReady = true;
        console.log('✅ 云数据库初始化成功 - 云优先模式');
      }
    } catch (error) {
      console.error('云数据库初始化失败:', error);
      this.isCloudReady = false;
    }
  },

  /**
   * 保存数据 - 云优先
   * 流程：云端保存 → 本地缓存
   * 直接返回保存的文档（兼容旧代码）
   */
  async save(collection, data) {
    const timestamp = Date.now();
    const isoTime = new Date().toISOString();
    const userId = await this.getUserId();
    
    const doc = this.filterInvalidFields({
      ...data,
      userId: userId,
      createTime: data.createTime || isoTime,
      updateTime: isoTime,
      version: (data.version || 0) + 1
    });

    if (this.isOnline && this.isCloudReady) {
      try {
        console.log(`☁️ 云端保存: ${collection}`);
        
        let result;
        if (doc._id) {
          const docId = doc._id;
          const docWithoutId = { ...doc };
          delete docWithoutId._id;
          result = await this.db.collection(collection).doc(docId).set({ data: docWithoutId });
          console.log(`✅ 云端更新成功: ${docId}`);
          doc._id = docId;
        } else {
          const docForAdd = { ...doc };
          delete docForAdd._id;
          result = await this.db.collection(collection).add({ data: docForAdd });
          doc._id = result._id;
          console.log(`✅ 云端创建成功: ${doc._id}`);
        }
        
        this.saveToLocal(collection, doc);
        console.log(`📱 已同步到本地缓存`);
        
        return doc;
        
      } catch (cloudError) {
        console.error('❌ 云端保存失败:', cloudError);
        
        if (this.isNetworkError(cloudError) || this.isMissingCollectionError(cloudError)) {
          console.log('云端暂不可写，降级到本地存储');
          return this.saveToLocalFallback(collection, doc);
        } else {
          throw new Error(`云端保存失败: ${cloudError.message}`);
        }
      }
    }
    
    console.log('📴 离线模式，保存到本地');
    return this.saveToLocalFallback(collection, doc);
  },

  /**
   * 获取数据 - 云优先
   * 直接返回数据对象（兼容旧代码）
   */
  async get(collection, id) {
    if (this.isOnline && this.isCloudReady && id) {
      try {
        console.log(`☁️ 云端获取: ${collection}/${id}`);
        
        try {
          const res = await this.db.collection(collection).doc(id).get();
          if (res.data) {
            console.log(`✅ 云端获取成功`);
            this.saveToLocal(collection, res.data);
            return res.data;
          }
        } catch (docError) {
          console.log('通过_id查询失败，尝试通过id字段查询');
          
          const userId = await this.getUserId();
          const queryRes = await this.db.collection(collection)
            .where({ userId, id: id })
            .limit(1)
            .get();
          
          if (queryRes.data && queryRes.data.length > 0) {
            console.log(`✅ 通过id字段查询成功`);
            this.saveToLocal(collection, queryRes.data[0]);
            return queryRes.data[0];
          }
          
          throw docError;
        }
      } catch (cloudError) {
        console.error('云端获取失败:', cloudError);
        
        if (this.isNetworkError(cloudError)) {
          console.log('⚠️ 网络错误，尝试本地缓存');
        } else if (cloudError.errMsg && cloudError.errMsg.includes('not found')) {
          console.log('云端文档不存在，检查本地缓存');
        } else {
          throw new Error(`云端获取失败: ${cloudError.message}`);
        }
      }
    }
    
    console.log(`📱 从本地获取: ${collection}/${id}`);
    const localData = this.getFromLocal(collection, id);
    return localData;
  },

  /**
   * 查询列表 - 云优先
   * 直接返回数组（兼容旧代码）
   */
  async list(collection, options = {}) {
    const { where = {}, orderBy = 'updateTime', order = 'desc', limit = 100, skip = 0 } = options;

    // 场景1: 在线且云端可用 → 云端查询
    if (this.isOnline && this.isCloudReady) {
      try {
        console.log(`☁️ 云端查询: ${collection}`);
        
        const userId = await this.getUserId();
        let query = this.db.collection(collection).where({ userId, ...where });
        
        if (orderBy) {
          query = query.orderBy(orderBy, order);
        }
        
        const res = await query.skip(skip).limit(limit).get();
        
        if (res.data && res.data.length > 0) {
          console.log(`✅ 云端查询成功: ${res.data.length}条`);
          // 更新本地缓存
          this.syncListToLocal(collection, res.data);
          return res.data;  // 直接返回数组
        }
      } catch (cloudError) {
        console.error('云端查询失败:', cloudError);
        
        if (!this.isNetworkError(cloudError) && !this.isMissingCollectionError(cloudError)) {
          throw new Error(`云端查询失败: ${cloudError.message}`);
        }
        console.log('云端暂不可读，使用本地数据');
      }
    }
    
    // 场景2: 离线 → 本地查询
    console.log(`📱 本地查询: ${collection}`);
    const localList = this.listFromLocal(collection, where);
    return localList;  // 直接返回数组
  },

  /**
   * 更新数据 - 云优先
   * 直接返回更新后的文档（兼容旧代码）
   */
  async update(collection, id, data) {
    const doc = this.filterInvalidFields({
      ...data,
      updateTime: new Date().toISOString(),
      version: (data.version || 0) + 1
    });

    if (this.isOnline && this.isCloudReady && id) {
      try {
        console.log(`☁️ 云端更新: ${collection}/${id}`);
        
        const docForUpdate = { ...doc };
        delete docForUpdate._id;
        
        await this.db.collection(collection).doc(id).update({ data: docForUpdate });
        console.log(`✅ 云端更新成功`);
        
        const updatedDoc = { ...doc, _id: id };
        this.updateLocal(collection, id, updatedDoc);
        
        return updatedDoc;
      } catch (cloudError) {
        console.error('云端更新失败:', cloudError);
        
        if (this.isNetworkError(cloudError)) {
          console.log('⚠️ 网络错误，降级到本地');
          const localDoc = this.updateLocal(collection, id, { ...doc, _id: id });
          this.markPendingSync(collection, id, doc, 'update');
          return localDoc;
        } else {
          throw new Error(`云端更新失败: ${cloudError.message}`);
        }
      }
    }
    
    console.log('📴 离线模式，更新本地');
    const localDoc = this.updateLocal(collection, id, { ...doc, _id: id });
    this.markPendingSync(collection, id, doc, 'update');
    return localDoc;
  },

  /**
   * 删除数据 - 云优先
   * 直接返回 true（兼容旧代码）
   */
  async remove(collection, id) {
    // 场景1: 在线且云端可用 → 云端删除
    if (this.isOnline && this.isCloudReady && id) {
      try {
        console.log(`☁️ 云端删除: ${collection}/${id}`);
        
        await this.db.collection(collection).doc(id).remove();
        console.log(`✅ 云端删除成功`);
        
        // 删除本地缓存
        this.removeFromLocal(collection, id);
        
        return true;
      } catch (cloudError) {
        console.error('云端删除失败:', cloudError);
        
        if (this.isNetworkError(cloudError)) {
          console.log('⚠️ 网络错误，仅删除本地');
          this.removeFromLocal(collection, id);
          this.markPendingSync(collection, id, null, 'remove');
          return true;
        } else {
          throw new Error(`云端删除失败: ${cloudError.message}`);
        }
      }
    }
    
    // 场景2: 离线 → 本地删除
    this.removeFromLocal(collection, id);
    this.markPendingSync(collection, id, null, 'remove');
    return true;
  },

  // ==================== 本地存储方法 ====================

  saveToLocal(collection, doc) {
    const key = this.getLocalKey(collection);
    let list = wx.getStorageSync(key) || [];
    
    const index = list.findIndex(item => 
      (item._id && item._id === doc._id) || 
      (item.id && doc.id && String(item.id) === String(doc.id))
    );
    
    if (index > -1) {
      list[index] = doc;
    } else {
      list.unshift(doc);
    }
    
    wx.setStorageSync(key, list);
  },

  getFromLocal(collection, id) {
    const key = this.getLocalKey(collection);
    const list = wx.getStorageSync(key) || [];
    return list.find(item => 
      (item._id && item._id === id) || 
      (item.id && String(item.id) === String(id))
    );
  },

  listFromLocal(collection, where = {}) {
    const key = this.getLocalKey(collection);
    let list = wx.getStorageSync(key) || [];
    
    if (Object.keys(where).length > 0) {
      list = list.filter(item => {
        return Object.keys(where).every(k => {
          if (k === 'userId') return true;
          return item[k] === where[k];
        });
      });
    }
    
    return list;
  },

  updateLocal(collection, id, doc) {
    const key = this.getLocalKey(collection);
    let list = wx.getStorageSync(key) || [];
    const index = list.findIndex(item => 
      (item._id && item._id === id) || 
      (item.id && item.id === id)
    );
    
    if (index > -1) {
      list[index] = { ...list[index], ...doc };
      wx.setStorageSync(key, list);
      return list[index];
    }
    return null;
  },

  removeFromLocal(collection, id) {
    const key = this.getLocalKey(collection);
    let list = wx.getStorageSync(key) || [];
    list = list.filter(item => {
      const itemId = item._id || item.id;
      return String(itemId || '') !== String(id || '');
    });
    wx.setStorageSync(key, list);
  },

  syncListToLocal(collection, docs) {
    const key = this.getLocalKey(collection);
    const localMap = new Map();
    const existingList = wx.getStorageSync(key) || [];
    
    existingList.forEach(item => {
      const id = item._id || item.id;
      localMap.set(id, item);
    });
    
    docs.forEach(doc => {
      const id = doc._id || doc.id;
      localMap.set(id, doc);
    });
    
    const mergedList = Array.from(localMap.values()).sort((a, b) => {
      return new Date(b.updateTime) - new Date(a.updateTime);
    });
    
    wx.setStorageSync(key, mergedList);
  },

  getLocalKey(collection) {
    const keyMap = {
      'courses': 'courses',
      'notes': 'notes',
      'mistakes': 'mistakes',
      'flashcards': 'flashcards',
      'exams': 'exams'
    };
    return keyMap[collection] || collection;
  },

  // ==================== 辅助方法 ====================

  saveToLocalFallback(collection, doc) {
    this.saveToLocal(collection, doc);
    this.markPendingSync(collection, doc._id || doc.id, doc, 'save');
    return doc;  // 直接返回文档
  },

  markPendingSync(collection, id, data, action) {
    const pendingSync = wx.getStorageSync('pendingSync') || [];
    pendingSync.push({
      collection,
      id: id,
      data: data,
      action: action,
      timestamp: Date.now()
    });
    wx.setStorageSync('pendingSync', pendingSync);
    console.log(`📝 已标记待同步: ${action}`);
  },

  /**
   * add 是 save 的别名（兼容旧代码）
   */
  async add(collection, data) {
    return await this.save(collection, data);
  },

  filterInvalidFields(data) {
    const reservedFields = ['_id', '_openid', '_createTime', '_updateTime'];
    const filtered = { ...data };
    
    for (const field of reservedFields) {
      if (field !== '_id' && filtered.hasOwnProperty(field)) {
        console.log(`⚠️ 移除保留字段: ${field}`);
        delete filtered[field];
      }
    }
    
    return filtered;
  },

  isNetworkError(error) {
    if (!error) return false;
    
    const errorMsg = error.errMsg || error.message || '';
    const networkKeywords = [
      'network',
      'timeout',
      'request:fail',
      '网络',
      '超时'
    ];
    
    return networkKeywords.some(keyword => 
      errorMsg.toLowerCase().includes(keyword.toLowerCase())
    );
  },

  isMissingCollectionError(error) {
    const errorMsg = (error && (error.errMsg || error.message || String(error))) || '';
    return errorMsg.includes('collection not exists') ||
      errorMsg.includes('DATABASE_COLLECTION_NOT_EXIST') ||
      errorMsg.includes('Db or Table not exist') ||
      errorMsg.includes('ResourceNotFound');
  },

  async getUserId() {
    let openId = wx.getStorageSync('openId');
    
    if (!openId && this.isCloudReady) {
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
  },

  async syncPendingData() {
    const pendingSync = wx.getStorageSync('pendingSync') || [];
    if (pendingSync.length === 0) {
      console.log('没有待同步数据');
      return;
    }

    if (!this.isOnline || !this.isCloudReady) {
      console.log('离线或云端不可用，跳过同步');
      return;
    }

    console.log(`🔄 开始同步 ${pendingSync.length} 条待同步数据`);
    wx.showLoading({ title: '同步中...', mask: true });

    const failedItems = [];
    let successCount = 0;

    for (const item of pendingSync) {
      try {
        if (item.action === 'save') {
          await this.db.collection(item.collection).add({ data: item.data });
          successCount++;
        } else if (item.action === 'update') {
          await this.db.collection(item.collection).doc(item.id).update({ data: item.data });
          successCount++;
        }
      } catch (error) {
        console.error('同步失败:', error);
        failedItems.push(item);
      }
    }

    wx.hideLoading();

    if (successCount > 0) {
      wx.showToast({
        title: `成功同步 ${successCount} 条`,
        icon: 'success'
      });
    }

    // 保存失败的项目
    wx.setStorageSync('pendingSync', failedItems);
    console.log(`同步完成: 成功${successCount}条，失败${failedItems.length}条`);
  },

  async getStorageStats() {
    const stats = {
      cloud: {
        enabled: this.isCloudReady,
        online: this.isOnline,
        courses: 0,
        notes: 0,
        mistakes: 0
      },
      local: {
        courses: 0,
        notes: 0,
        mistakes: 0,
        currentSize: 0,
        limitSize: 10240
      },
      pendingSync: (wx.getStorageSync('pendingSync') || []).length
    };

    // 云端统计
    if (this.isCloudReady && this.isOnline) {
      try {
        const userId = await this.getUserId();
        
        for (const col of ['courses', 'notes', 'mistakes']) {
          const countRes = await this.db.collection(col).where({ userId }).count();
          stats.cloud[col] = countRes.total;
        }
      } catch (error) {
        console.error('获取云端统计失败:', error);
      }
    }

    // 本地统计
    for (const col of ['courses', 'notes', 'mistakes']) {
      const list = wx.getStorageSync(col) || [];
      stats.local[col] = list.length;
    }

    // 存储空间
    try {
      const storageInfo = await wx.getStorageInfo();
      stats.local.currentSize = storageInfo.currentSize;
      stats.local.limitSize = storageInfo.limitSize;
    } catch (error) {
      console.error('获取存储信息失败:', error);
    }

    return stats;
  }
};

module.exports = CloudFirstStorage;
