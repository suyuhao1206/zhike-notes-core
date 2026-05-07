/**
 * 云数据库封装模块
 * 支持云端+本地双写，离线优先策略
 */

const DB = {
  isCloudReady: false,
  db: null,

  init() {
    if (wx.cloud) {
      this.db = wx.cloud.database();
      this.isCloudReady = true;
      console.log('云数据库初始化成功');
    }
  },

  _getOpenId() {
    const app = getApp();
    return app.globalData.openId || 'anonymous';
  },

  async _getUserId() {
    let openId = this._getOpenId();
    if (openId === 'anonymous') {
      try {
        const res = await wx.cloud.callFunction({
          name: 'getOpenId'
        });
        openId = res.result.openid;
        const app = getApp();
        app.globalData.openId = openId;
        wx.setStorageSync('openId', openId);
      } catch (e) {
        console.warn('获取 openId 失败，使用匿名模式:', e);
      }
    }
    return openId;
  },

  async add(collection, data) {
    const openId = await this._getUserId();
    const doc = {
      ...data,
      _openid: openId,
      createTime: data.createTime || new Date().toISOString(),
      updateTime: new Date().toISOString()
    };

    if (this.isCloudReady) {
      try {
        const res = await this.db.collection(collection).add({ data: doc });
        doc._id = res._id;
        this._syncToLocal(collection, doc);
        return doc;
      } catch (e) {
        console.error('云端写入失败，降级到本地:', e);
      }
    }

    return this._addToLocal(collection, doc);
  },

  async update(collection, id, data) {
    const doc = {
      ...data,
      updateTime: new Date().toISOString()
    };

    if (this.isCloudReady && id) {
      try {
        await this.db.collection(collection).doc(id).update({ data: doc });
        this._updateLocal(collection, id, doc);
        return { ...doc, _id: id };
      } catch (e) {
        console.error('云端更新失败:', e);
      }
    }

    return this._updateLocal(collection, id, doc);
  },

  async remove(collection, id) {
    if (this.isCloudReady && id) {
      try {
        await this.db.collection(collection).doc(id).remove();
      } catch (e) {
        console.error('云端删除失败:', e);
      }
    }

    this._removeFromLocal(collection, id);
    return true;
  },

  async get(collection, id) {
    const localData = this._getFromLocal(collection, id);
    
    if (this.isCloudReady && id) {
      try {
        const res = await this.db.collection(collection).doc(id).get();
        if (res.data) {
          this._syncToLocal(collection, res.data);
          return res.data;
        }
      } catch (e) {
        console.warn('云端获取失败，使用本地数据:', e);
      }
    }

    return localData;
  },

  async list(collection, options = {}) {
    const { where = {}, orderBy = 'updateTime', order = 'desc', limit = 20, skip = 0 } = options;

    if (this.isCloudReady) {
      try {
        const openId = await this._getUserId();
        let query = this.db.collection(collection).where({ _openid: openId, ...where });
        
        if (orderBy) {
          query = query.orderBy(orderBy, order);
        }
        
        const res = await query.skip(skip).limit(limit).get();
        
        if (res.data && res.data.length > 0) {
          this._syncListToLocal(collection, res.data);
          return res.data;
        }
      } catch (e) {
        console.warn('云端查询失败，使用本地数据:', e);
      }
    }

    return this._listFromLocal(collection, where);
  },

  async count(collection, where = {}) {
    if (this.isCloudReady) {
      try {
        const openId = await this._getUserId();
        const res = await this.db.collection(collection).where({ _openid: openId, ...where }).count();
        return res.total;
      } catch (e) {
        console.warn('云端计数失败:', e);
      }
    }

    const list = this._listFromLocal(collection, where);
    return list.length;
  },

  _addToLocal(collection, doc) {
    const key = this._getLocalKey(collection);
    const list = wx.getStorageSync(key) || [];
    doc.id = doc.id || Date.now();
    list.unshift(doc);
    wx.setStorageSync(key, list);
    return doc;
  },

  _updateLocal(collection, id, doc) {
    const key = this._getLocalKey(collection);
    const list = wx.getStorageSync(key) || [];
    const index = list.findIndex(item => item._id === id || item.id === id);
    if (index > -1) {
      list[index] = { ...list[index], ...doc };
      wx.setStorageSync(key, list);
      return list[index];
    }
    return null;
  },

  _removeFromLocal(collection, id) {
    const key = this._getLocalKey(collection);
    let list = wx.getStorageSync(key) || [];
    list = list.filter(item => item._id !== id && item.id !== id);
    wx.setStorageSync(key, list);
    return true;
  },

  _getFromLocal(collection, id) {
    const key = this._getLocalKey(collection);
    const list = wx.getStorageSync(key) || [];
    return list.find(item => item._id === id || item.id === id) || null;
  },

  _listFromLocal(collection, where = {}) {
    const key = this._getLocalKey(collection);
    let list = wx.getStorageSync(key) || [];
    
    if (Object.keys(where).length > 0) {
      list = list.filter(item => {
        return Object.keys(where).every(k => {
          if (k === '_openid') return true;
          return item[k] === where[k];
        });
      });
    }
    
    return list;
  },

  _syncToLocal(collection, doc) {
    const key = this._getLocalKey(collection);
    const list = wx.getStorageSync(key) || [];
    const index = list.findIndex(item => item._id === doc._id || item.id === doc.id);
    
    if (index > -1) {
      list[index] = doc;
    } else {
      list.unshift(doc);
    }
    
    wx.setStorageSync(key, list);
  },

  _syncListToLocal(collection, docs) {
    const key = this._getLocalKey(collection);
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

  _getLocalKey(collection) {
    const keyMap = {
      'courses': 'courses',
      'notes': 'notes',
      'mistakes': 'mistakes',
      'flashcards': 'flashcards',
      'exams': 'exams',
      'qa_records': 'qa_records'
    };
    return keyMap[collection] || collection;
  }
};

module.exports = DB;
