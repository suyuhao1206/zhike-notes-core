const CLOUD_ENV = 'cloud1-6gegqlssbeb8ee83'
const DEFAULT_LIMIT = 100
const SYNC_CONCURRENCY = 5
const STORAGE_PRUNE_THRESHOLD_KB = 8000
const STORAGE_PRUNE_TARGET_KB = 7000
const LOCAL_DOC_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const LOCAL_CACHE_COLLECTIONS = ['courses', 'notes', 'mistakes', 'flashcards', 'exams']

const CloudFirstStorage = {
  isCloudReady: false,
  db: null,
  isOnline: true,
  initPromise: null,
  isSyncing: false,
  lastPruneCheckAt: 0,

  async init() {
    if (this.initPromise) return this.initPromise

    this.initPromise = (async () => {
      this.bindNetworkListener()
      await this.refreshNetworkStatus()

      if (typeof wx !== 'undefined' && wx.cloud) {
        wx.cloud.init({
          env: CLOUD_ENV,
          traceUser: true
        })
        this.db = wx.cloud.database()
        this.isCloudReady = true
        console.log('Cloud database initialized')
      }
    })().catch(error => {
      this.isCloudReady = false
      this.initPromise = null
      console.error('Cloud database initialization failed:', error)
      throw error
    })

    return this.initPromise
  },

  async ensureReady() {
    if (!this.initPromise) {
      await this.init()
      return
    }
    await this.initPromise
  },

  bindNetworkListener() {
    if (this.networkListenerBound || !wx.onNetworkStatusChange) return

    wx.onNetworkStatusChange(res => {
      this.isOnline = !!res.isConnected
      if (this.isOnline) this.syncPendingData()
    })
    this.networkListenerBound = true
  },

  async refreshNetworkStatus() {
    if (!wx.getNetworkType) return

    try {
      const res = await wx.getNetworkType()
      this.isOnline = res.networkType !== 'none'
    } catch (error) {
      console.warn('Failed to read network status:', error)
    }
  },

  async save(collection, data = {}) {
    await this.ensureReady()

    const now = new Date().toISOString()
    const userId = await this.getUserId()
    const doc = this.filterInvalidFields({
      ...data,
      id: data.id || data._id || this.generateLocalId(collection),
      userId,
      createTime: data.createTime || now,
      updateTime: now,
      version: (data.version || 0) + 1
    })

    if (this.canUseCloud()) {
      try {
        if (doc._id) {
          const docId = doc._id
          const docForSet = { ...doc }
          delete docForSet._id
          await this.db.collection(collection).doc(docId).set({ data: docForSet })
          this.saveToLocal(collection, { ...docForSet, _id: docId })
          return { ...docForSet, _id: docId }
        }

        const docForAdd = { ...doc }
        delete docForAdd._id
        const result = await this.db.collection(collection).add({ data: docForAdd })
        const savedDoc = { ...docForAdd, _id: result._id }
        this.saveToLocal(collection, savedDoc)
        return savedDoc
      } catch (error) {
        if (!this.isNetworkError(error) && !this.isMissingCollectionError(error)) {
          throw new Error(`Cloud save failed: ${error.message || error.errMsg || error}`)
        }
        console.warn('Cloud save unavailable, using local pending queue:', error)
      }
    }

    return this.saveToLocalFallback(collection, doc)
  },

  async add(collection, data) {
    return this.save(collection, data)
  },

  async get(collection, id) {
    await this.ensureReady()

    if (this.canUseCloud() && id) {
      try {
        const res = await this.db.collection(collection).doc(id).get()
        if (res.data) {
          this.saveToLocal(collection, res.data)
          return res.data
        }
      } catch (docError) {
        try {
          const userId = await this.getUserId()
          const queryRes = await this.db.collection(collection)
            .where({ userId, id })
            .limit(1)
            .get()

          if (queryRes.data && queryRes.data.length > 0) {
            this.saveToLocal(collection, queryRes.data[0])
            return queryRes.data[0]
          }
        } catch (queryError) {
          if (!this.isNetworkError(queryError) && !this.isMissingCollectionError(queryError)) {
            throw new Error(`Cloud get failed: ${queryError.message || queryError.errMsg || queryError}`)
          }
        }

        if (!this.isNetworkError(docError) && !this.isMissingCollectionError(docError)) {
          console.warn('Cloud doc get failed, checking local cache:', docError)
        }
      }
    }

    return this.getFromLocal(collection, id)
  },

  async list(collection, options = {}) {
    await this.ensureReady()

    const {
      where = {},
      orderBy = 'updateTime',
      order = 'desc',
      limit = DEFAULT_LIMIT,
      skip = 0
    } = options

    if (this.canUseCloud()) {
      try {
        const userId = await this.getUserId()
        let query = this.db.collection(collection).where({ userId, ...where })

        if (orderBy) query = query.orderBy(orderBy, order)

        const res = await query.skip(skip).limit(limit).get()
        const docs = res.data || []
        this.syncListToLocal(collection, docs)
        return docs
      } catch (error) {
        if (!this.isNetworkError(error) && !this.isMissingCollectionError(error)) {
          throw new Error(`Cloud list failed: ${error.message || error.errMsg || error}`)
        }
        console.warn('Cloud list unavailable, using local cache:', error)
      }
    }

    return this.listFromLocal(collection, where, { orderBy, order, limit, skip })
  },

  async update(collection, id, data = {}) {
    await this.ensureReady()

    const doc = this.filterInvalidFields({
      ...data,
      updateTime: new Date().toISOString(),
      version: (data.version || 0) + 1
    })

    if (this.canUseCloud() && id) {
      try {
        const docForUpdate = { ...doc }
        delete docForUpdate._id
        await this.db.collection(collection).doc(id).update({ data: docForUpdate })

        const updatedDoc = this.updateLocal(collection, id, { ...docForUpdate, _id: id }) || { ...docForUpdate, _id: id }
        return updatedDoc
      } catch (error) {
        if (!this.isNetworkError(error)) {
          throw new Error(`Cloud update failed: ${error.message || error.errMsg || error}`)
        }
        console.warn('Cloud update unavailable, marking pending:', error)
      }
    }

    const localDoc = this.updateLocal(collection, id, { ...doc, _id: id }) || { ...doc, _id: id }
    this.markPendingSync(collection, id, doc, 'update')
    return localDoc
  },

  async remove(collection, id) {
    await this.ensureReady()

    if (this.canUseCloud() && id) {
      try {
        await this.db.collection(collection).doc(id).remove()
        this.removeFromLocal(collection, id)
        return true
      } catch (error) {
        if (!this.isNetworkError(error)) {
          throw new Error(`Cloud remove failed: ${error.message || error.errMsg || error}`)
        }
        console.warn('Cloud remove unavailable, marking pending:', error)
      }
    }

    this.removeFromLocal(collection, id)
    this.markPendingSync(collection, id, null, 'remove')
    return true
  },

  canUseCloud() {
    return this.isOnline && this.isCloudReady && this.db
  },

  saveToLocalFallback(collection, doc) {
    const savedDoc = this.saveToLocal(collection, doc)
    this.markPendingSync(collection, savedDoc._id || savedDoc.id, savedDoc, 'save')
    return savedDoc
  },

  saveToLocal(collection, doc = {}) {
    const id = this.getDocumentId(doc) || this.generateLocalId(collection)
    const savedDoc = { ...doc }
    if (!savedDoc.id && !savedDoc._id) savedDoc.id = id

    const docKey = this.getLocalDocKey(collection, id)
    this.pruneLocalCacheIfNeeded()

    try {
      wx.setStorageSync(docKey, savedDoc)
    } catch (error) {
      console.warn('Local storage write failed, pruning stale cache before retry:', error)
      this.pruneLocalCacheIfNeeded({ force: true })
      wx.setStorageSync(docKey, savedDoc)
    }

    this.upsertLocalIndex(collection, savedDoc, id)
    return savedDoc
  },

  getFromLocal(collection, id) {
    if (!id) return null
    this.migrateLegacyCollection(collection)

    const doc = wx.getStorageSync(this.getLocalDocKey(collection, id))
    if (doc) return doc

    const index = this.getLocalIndex(collection)
    for (const entry of index) {
      const item = wx.getStorageSync(this.getLocalDocKey(collection, entry.id))
      if (!item) continue
      if (sameId(item._id, id) || sameId(item.id, id)) return item
    }

    return null
  },

  listFromLocal(collection, where = {}, options = {}) {
    this.migrateLegacyCollection(collection)

    const limit = Number(options.limit || DEFAULT_LIMIT)
    const skip = Number(options.skip || 0)
    const order = options.order || 'desc'
    const index = this.getLocalIndex(collection)
      .slice()
      .sort((a, b) => compareIndexEntries(a, b, order))

    const docs = []
    let matchedCount = 0

    for (const entry of index) {
      const doc = wx.getStorageSync(this.getLocalDocKey(collection, entry.id))
      if (!doc || !this.matchesWhere(doc, where)) continue

      if (matchedCount >= skip && docs.length < limit) {
        docs.push(doc)
      }

      matchedCount++
      if (docs.length >= limit) break
    }

    return docs
  },

  updateLocal(collection, id, doc = {}) {
    const existing = this.getFromLocal(collection, id) || {}
    const merged = {
      ...existing,
      ...doc
    }

    if (!merged.id && !merged._id) {
      merged.id = id || this.generateLocalId(collection)
    }

    return this.saveToLocal(collection, merged)
  },

  removeFromLocal(collection, id) {
    if (!id) return
    this.migrateLegacyCollection(collection)

    const index = this.getLocalIndex(collection)
    const nextIndex = []

    index.forEach(entry => {
      const doc = wx.getStorageSync(this.getLocalDocKey(collection, entry.id))
      const shouldRemove = sameId(entry.id, id) || sameId(doc && doc._id, id) || sameId(doc && doc.id, id)

      if (shouldRemove) {
        wx.removeStorageSync(this.getLocalDocKey(collection, entry.id))
      } else {
        nextIndex.push(entry)
      }
    })

    this.setLocalIndex(collection, nextIndex)
  },

  syncListToLocal(collection, docs = []) {
    docs.forEach(doc => this.saveToLocal(collection, doc))
  },

  upsertLocalIndex(collection, doc, id) {
    const index = this.getLocalIndex(collection)
    const timestamp = doc.updateTime || doc.createTime || new Date().toISOString()
    const nextEntry = {
      id,
      updateTime: timestamp,
      createTime: doc.createTime || timestamp
    }

    const nextIndex = [nextEntry].concat(index.filter(entry => !sameId(entry.id, id)))
    this.setLocalIndex(collection, nextIndex)
  },

  getLocalIndex(collection) {
    this.migrateLegacyCollection(collection)
    const index = wx.getStorageSync(this.getLocalIndexKey(collection))
    return Array.isArray(index) ? index : []
  },

  setLocalIndex(collection, index) {
    wx.setStorageSync(this.getLocalIndexKey(collection), index)
  },

  migrateLegacyCollection(collection) {
    const indexKey = this.getLocalIndexKey(collection)
    const existingIndex = wx.getStorageSync(indexKey)
    if (Array.isArray(existingIndex)) return

    const legacyKey = this.getLegacyLocalKey(collection)
    const legacyList = wx.getStorageSync(legacyKey)
    if (!Array.isArray(legacyList) || legacyList.length === 0) {
      wx.setStorageSync(indexKey, [])
      return
    }

    const index = []
    legacyList.forEach(item => {
      const id = this.getDocumentId(item) || this.generateLocalId(collection)
      const doc = { ...item }
      if (!doc.id && !doc._id) doc.id = id
      wx.setStorageSync(this.getLocalDocKey(collection, id), doc)
      index.push({
        id,
        updateTime: doc.updateTime || doc.createTime || new Date().toISOString(),
        createTime: doc.createTime || doc.updateTime || new Date().toISOString()
      })
    })

    this.setLocalIndex(collection, index)
    wx.removeStorageSync(legacyKey)
  },

  getLocalIndexKey(collection) {
    return `localIndex:${collection}`
  },

  getLocalDocKey(collection, id) {
    return `localDoc:${collection}:${id}`
  },

  getLegacyLocalKey(collection) {
    const keyMap = {
      courses: 'courses',
      notes: 'notes',
      mistakes: 'mistakes',
      flashcards: 'flashcards',
      exams: 'exams'
    }
    return keyMap[collection] || collection
  },

  getDocumentId(doc = {}) {
    return doc._id || doc.id || ''
  },

  generateLocalId(collection) {
    return `${collection}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  },

  matchesWhere(doc = {}, where = {}) {
    return Object.keys(where || {}).every(key => {
      if (key === 'userId') return true
      return sameId(doc[key], where[key])
    })
  },

  markPendingSync(collection, id, data, action) {
    const pendingSync = wx.getStorageSync('pendingSync') || []
    pendingSync.push({
      collection,
      id,
      data,
      action,
      timestamp: Date.now()
    })
    wx.setStorageSync('pendingSync', pendingSync)
  },

  async syncPendingData() {
    if (this.isSyncing) return

    this.isSyncing = true
    let loadingShown = false

    try {
      await this.ensureReady()

      const pendingSync = wx.getStorageSync('pendingSync') || []
      if (pendingSync.length === 0) return
      if (!this.canUseCloud()) return
      const syncingKeys = new Set(pendingSync.map(item => getPendingItemKey(item)))

      try {
        await this.getUserId()
      } catch (error) {
        console.warn('Skip pending sync until identity is initialized:', error)
        return
      }

      wx.showLoading({ title: '同步中...', mask: true })
      loadingShown = true

      const failedItems = []
      let successCount = 0

      await runWithConcurrency(pendingSync, SYNC_CONCURRENCY, async item => {
        try {
          await this.syncOnePendingItem(item)
          successCount++
        } catch (error) {
          console.error('Pending sync failed:', error)
          failedItems.push(item)
        }
      })

      const latestPendingSync = wx.getStorageSync('pendingSync') || []
      const newItems = latestPendingSync.filter(item => !syncingKeys.has(getPendingItemKey(item)))
      wx.setStorageSync('pendingSync', failedItems.concat(newItems))

      if (successCount > 0) {
        wx.showToast({
          title: `已同步 ${successCount} 条`,
          icon: 'success'
        })
      }
    } finally {
      if (loadingShown) wx.hideLoading()
      this.isSyncing = false
    }
  },

  async syncOnePendingItem(item) {
    if (item.action === 'remove') {
      await this.db.collection(item.collection).doc(item.id).remove()
      return
    }

    const data = this.filterInvalidFields({ ...(item.data || {}) })
    delete data._id

    if (item.action === 'update') {
      await this.db.collection(item.collection).doc(item.id).update({ data })
      return
    }

    if (item.action === 'save') {
      if (item.data && item.data._id) {
        await this.db.collection(item.collection).doc(item.data._id).set({ data })
        return
      }

      const result = await this.db.collection(item.collection).add({ data })
      if (result && result._id && item.data) {
        this.updateLocal(item.collection, item.id, { ...item.data, _id: result._id })
      }
    }
  },

  filterInvalidFields(data = {}) {
    const filtered = { ...data }
    ;['_openid', '_createTime', '_updateTime'].forEach(field => {
      delete filtered[field]
    })
    return filtered
  },

  isNetworkError(error) {
    if (!error) return false

    const errorMsg = String(error.errMsg || error.message || error).toLowerCase()
    return ['network', 'timeout', 'request:fail', 'fail interrupted', '网络', '超时'].some(keyword => {
      return errorMsg.includes(keyword.toLowerCase())
    })
  },

  isMissingCollectionError(error) {
    const errorMsg = String(error && (error.errMsg || error.message || error))
    return errorMsg.includes('collection not exists') ||
      errorMsg.includes('DATABASE_COLLECTION_NOT_EXIST') ||
      errorMsg.includes('Db or Table not exist') ||
      errorMsg.includes('ResourceNotFound')
  },

  async getUserId() {
    const cachedOpenId = wx.getStorageSync('openId')
    if (cachedOpenId) return cachedOpenId

    if (!this.canUseCloud()) {
      throw new Error('首次使用需要联网完成身份初始化')
    }

    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenId' })
      const openId = res && res.result && res.result.openid
      if (!openId) throw new Error('OpenId is empty')
      wx.setStorageSync('openId', openId)
      return openId
    } catch (error) {
      throw new Error(`身份初始化失败：${error.message || error.errMsg || error}`)
    }
  },

  async getStorageStats() {
    await this.ensureReady()

    const stats = {
      cloud: {
        enabled: this.isCloudReady,
        online: this.isOnline,
        courses: 0,
        notes: 0,
        mistakes: 0
      },
      local: {
        courses: this.getLocalIndex('courses').length,
        notes: this.getLocalIndex('notes').length,
        mistakes: this.getLocalIndex('mistakes').length,
        currentSize: 0,
        limitSize: 10240
      },
      pendingSync: (wx.getStorageSync('pendingSync') || []).length
    }

    if (this.canUseCloud()) {
      try {
        const userId = await this.getUserId()
        for (const collection of ['courses', 'notes', 'mistakes']) {
          const countRes = await this.db.collection(collection).where({ userId }).count()
          stats.cloud[collection] = countRes.total
        }
      } catch (error) {
        console.warn('Failed to read cloud storage stats:', error)
      }
    }

    try {
      const storageInfo = await wx.getStorageInfo()
      stats.local.currentSize = storageInfo.currentSize
      stats.local.limitSize = storageInfo.limitSize

      const cleanup = this.pruneLocalCacheIfNeeded({
        force: true,
        currentSize: storageInfo.currentSize,
        limitSize: storageInfo.limitSize
      })

      if (cleanup.removed > 0) {
        const refreshedStorageInfo = await wx.getStorageInfo()
        stats.local.currentSize = refreshedStorageInfo.currentSize
        stats.local.limitSize = refreshedStorageInfo.limitSize
        stats.local.courses = this.getLocalIndex('courses').length
        stats.local.notes = this.getLocalIndex('notes').length
        stats.local.mistakes = this.getLocalIndex('mistakes').length
      }
    } catch (error) {
      console.warn('Failed to read local storage stats:', error)
    }

    return stats
  },

  pruneLocalCacheIfNeeded(options = {}) {
    const now = Date.now()
    if (!options.force && now - this.lastPruneCheckAt < 60 * 1000) {
      return { removed: 0 }
    }

    this.lastPruneCheckAt = now

    let currentSize = Number(options.currentSize || 0)
    let limitSize = Number(options.limitSize || 10240)

    if (!currentSize && wx.getStorageInfoSync) {
      try {
        const storageInfo = wx.getStorageInfoSync()
        currentSize = storageInfo.currentSize
        limitSize = storageInfo.limitSize || limitSize
      } catch (error) {
        console.warn('Failed to read sync storage stats:', error)
        return { removed: 0 }
      }
    }

    if (currentSize <= STORAGE_PRUNE_THRESHOLD_KB) {
      return { removed: 0, currentSize, limitSize }
    }

    const cutoff = now - LOCAL_DOC_RETENTION_MS
    const pendingRefs = this.getPendingLocalRefs()
    const candidates = []

    LOCAL_CACHE_COLLECTIONS.forEach(collection => {
      const index = this.getLocalIndex(collection)

      index.forEach(entry => {
        const key = this.getLocalDocKey(collection, entry.id)
        const doc = wx.getStorageSync(key)
        if (!doc || !this.hasCloudBackup(doc)) return
        if (this.hasPendingLocalChange(pendingRefs, collection, entry, doc)) return

        const updatedAt = parseTime(entry.updateTime || doc.updateTime || doc.createTime)
        if (!updatedAt || updatedAt > cutoff) return

        candidates.push({
          collection,
          entryId: entry.id,
          key,
          updatedAt,
          estimatedSize: estimateStorageSizeKb(key, doc)
        })
      })
    })

    candidates.sort((a, b) => a.updatedAt - b.updatedAt)

    const removedByCollection = {}
    let removed = 0
    let estimatedSize = currentSize

    candidates.forEach(candidate => {
      if (estimatedSize <= STORAGE_PRUNE_TARGET_KB) return

      wx.removeStorageSync(candidate.key)
      if (!removedByCollection[candidate.collection]) {
        removedByCollection[candidate.collection] = new Set()
      }
      removedByCollection[candidate.collection].add(String(candidate.entryId))
      estimatedSize -= candidate.estimatedSize
      removed++
    })

    Object.keys(removedByCollection).forEach(collection => {
      const removedIds = removedByCollection[collection]
      const nextIndex = this.getLocalIndex(collection).filter(entry => !removedIds.has(String(entry.id)))
      this.setLocalIndex(collection, nextIndex)
    })

    if (removed > 0) {
      console.info(`Pruned ${removed} stale local cache documents`)
    }

    return { removed, currentSize, limitSize }
  },

  hasCloudBackup(doc = {}) {
    return !!doc._id
  },

  getPendingLocalRefs() {
    const pendingSync = wx.getStorageSync('pendingSync') || []
    const refs = {}

    pendingSync.forEach(item => {
      if (!item || !item.collection) return
      if (!refs[item.collection]) refs[item.collection] = new Set()

      ;[item.id, item.data && item.data.id, item.data && item.data._id].forEach(id => {
        if (id) refs[item.collection].add(String(id))
      })
    })

    return refs
  },

  hasPendingLocalChange(pendingRefs, collection, entry = {}, doc = {}) {
    const refs = pendingRefs[collection]
    if (!refs) return false

    return [entry.id, doc.id, doc._id].some(id => id && refs.has(String(id)))
  }
}

function sameId(a, b) {
  return String(a || '') === String(b || '')
}

function parseTime(value) {
  const timestamp = new Date(value || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function estimateStorageSizeKb(key, value) {
  try {
    return Math.max(1, Math.ceil((String(key).length + JSON.stringify(value).length) / 1024))
  } catch (error) {
    return 1
  }
}

function getPendingItemKey(item = {}) {
  return [
    item.collection || '',
    item.id || '',
    item.action || '',
    item.timestamp || ''
  ].join(':')
}

function compareIndexEntries(a, b, order) {
  const left = new Date(a.updateTime || a.createTime || 0).getTime()
  const right = new Date(b.updateTime || b.createTime || 0).getTime()
  return order === 'asc' ? left - right : right - left
}

async function runWithConcurrency(items, limit, worker) {
  const executing = []

  for (const item of items) {
    const task = Promise.resolve().then(() => worker(item))
    executing.push(task)

    const clean = () => {
      const index = executing.indexOf(task)
      if (index > -1) executing.splice(index, 1)
    }
    task.then(clean).catch(clean)

    if (executing.length >= limit) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
}

module.exports = CloudFirstStorage
