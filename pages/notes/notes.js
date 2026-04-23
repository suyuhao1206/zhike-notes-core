// pages/notes/notes.js
const api = require('../../api/api.js');
const util = require('../../utils/util.js');

Page({
  data: {
    notes: [],
    filteredNotes: [],
    courses: [],
    selectedCourse: null,
    searchKeyword: '',
    loading: false,
    hasMore: true,
    pageSize: 10,
    currentPage: 1
  },

  onLoad(options) {
    const courseId = options.courseId;
    if (courseId) {
      this.setData({ selectedCourse: courseId });
    }
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  onPullDownRefresh() {
    this.setData({ currentPage: 1, hasMore: true });
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 加载数据
  async loadData() {
    this.setData({ loading: true });

    try {
      // 加载课程列表
      const courses = await api.getCourses();
      this.setData({ courses: [{ id: 0, name: '全部课程' }, ...courses] });

      // 加载笔记
      await this.loadNotes();
    } catch (error) {
      console.error('加载数据失败:', error);
    }

    this.setData({ loading: false });
  },

  // 加载笔记列表
  async loadNotes() {
    try {
      const notes = await api.getNotes(this.data.selectedCourse || undefined);

      // 格式化
      const formattedNotes = notes.map(note => ({
        ...note,
        createTimeFormatted: this.formatTime(note.createTime),
        summaryShort: note.summary ? note.summary.substring(0, 50) + '...' : '暂无摘要'
      }));

      this.setData({
        notes: formattedNotes,
        filteredNotes: formattedNotes
      });

      this.filterNotes();
    } catch (error) {
      console.error('加载笔记失败:', error);
    }
  },

  // 格式化时间
  formatTime(timeStr) {
    if (!timeStr) return '未知时间';
    const date = new Date(timeStr);
    const now = new Date();
    const diff = now - date;

    const days = Math.floor(diff / 86400000);
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;

    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
    this.filterNotes();
  },

  // 过滤笔记
  stopPropagation() {
  },

  filterNotes() {
    const { notes, searchKeyword, selectedCourse } = this.data;

    let filtered = notes;

    // 按课程过滤
    if (selectedCourse) {
      filtered = filtered.filter(n => String(n.courseId || '') === String(selectedCourse));
    }

    // 按关键词过滤
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      filtered = filtered.filter(n =>
        (n.title || '').toLowerCase().includes(keyword) ||
        (n.content || '').toLowerCase().includes(keyword) ||
        (n.courseName || '').toLowerCase().includes(keyword)
      );
    }

    this.setData({ filteredNotes: filtered });
  },

  // 选择课程
  selectCourse(e) {
    const courseId = e.currentTarget.dataset.id;
    this.setData({
      selectedCourse: courseId === 0 ? null : courseId,
      currentPage: 1
    });
    this.filterNotes();
  },

  // 查看笔记详情
  viewNote(e) {
    const noteId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/note/note?id=${noteId}`
    });
  },

  // 删除笔记
  async deleteNote(e) {
    const noteId = e.currentTarget.dataset.id;

    const confirmed = await util.confirm('删除后无法恢复，确定删除吗？', '确认删除');
    if (confirmed) {
      try {
        await api.deleteNote(noteId);
        wx.showToast({ title: '删除成功', icon: 'success' });
        this.loadNotes();
      } catch (error) {
        wx.showToast({ title: '删除失败', icon: 'none' });
      }
    }
  },

  // 新建笔记
  createNote() {
    wx.showActionSheet({
      itemList: ['新建笔记', '录音转写', '拍图识别'],
      success: (res) => {
        if (res.tapIndex === 0) {
          const courseId = this.data.selectedCourse || '';
          wx.navigateTo({
            url: `/pages/note-edit/note-edit${courseId ? '?courseId=' + courseId : ''}`
          });
        } else if (res.tapIndex === 1) {
          wx.switchTab({
            url: '/pages/record/record'
          });
        } else if (res.tapIndex === 2) {
          wx.navigateTo({
            url: '/pages/ocr/ocr'
          });
        }
      }
    });
  },

  editNote(e) {
    const noteId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/note-edit/note-edit?noteId=${noteId}`
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ currentPage: this.data.currentPage + 1 });
      this.loadNotes();
    }
  }
});
