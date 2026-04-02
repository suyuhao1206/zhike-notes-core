// pages/search/search.js
const api = require('../../api/api.js');
const util = require('../../utils/util.js');

Page({
  data: {
    query: '',
    searchHistory: [],
    hotTags: ['高数', '英语', '计算机', '数据结构', '算法'],
    notes: [],
    isLoading: false,
    hasSearched: false
  },

  onLoad() {
    this.loadSearchHistory();
  },

  // 加载搜索历史
  loadSearchHistory() {
    const history = util.getStorage('search_history', []);
    this.setData({ searchHistory: history });
  },

  // 保存搜索历史
  saveSearchHistory(query) {
    if (!query.trim()) return;

    let history = util.getStorage('search_history', []);
    // 去重并移到最前
    history = history.filter(h => h !== query);
    history.unshift(query);
    // 只保留最近10条
    history = history.slice(0, 10);

    util.setStorage('search_history', history);
    this.setData({ searchHistory: history });
  },

  // 输入变化
  onInput(e) {
    this.setData({ query: e.detail.value });
  },

  // 搜索
  async search() {
    const query = this.data.query.trim();
    if (!query) {
      util.showToast('请输入搜索内容');
      return;
    }

    this.saveSearchHistory(query);
    this.performSearch(query);
  },

  // 执行搜索
  async performSearch(query) {
    this.setData({ isLoading: true, hasSearched: true });

    try {
      const result = await api.searchNotes(query);

      // 格式化结果
      const notes = result.notes.map(note => ({
        ...note,
        summary: util.truncateText(util.stripHtml(note.content), 80),
        createTimeFormatted: util.getRelativeTime(note.createTime)
      }));

      this.setData({
        notes,
        isLoading: false
      });
    } catch (error) {
      console.error('搜索失败:', error);
      this.setData({ isLoading: false });
      util.showToast('搜索失败，请重试');
    }
  },

  // 点击历史记录
  onHistoryTap(e) {
    const query = e.currentTarget.dataset.query;
    this.setData({ query });
    this.performSearch(query);
  },

  // 点击热门标签
  onTagTap(e) {
    const tag = e.currentTarget.dataset.tag;
    this.setData({ query: tag });
    this.performSearch(tag);
  },

  // 清除历史
  clearHistory() {
    util.confirm('确定要清空搜索历史吗？').then(confirmed => {
      if (confirmed) {
        util.removeStorage('search_history');
        this.setData({ searchHistory: [] });
        util.showSuccess('已清空');
      }
    });
  },

  // 查看笔记
  viewNote(e) {
    const noteId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/note/note?id=${noteId}`
    });
  },

  // 清除搜索
  clearSearch() {
    this.setData({
      query: '',
      notes: [],
      hasSearched: false
    });
  }
});
