// pages/index/index.js
const api = require('../../api/api.js');

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    courseList: [],
    recentNotes: []
  },

  onLoad() {
    this.loadUserData();
  },

  onShow() {
    // 每次显示页面时刷新数据
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

    // 加载课程列表
    await this.loadCourseList();

    // 加载最近笔记
    await this.loadRecentNotes();
  },

  // 加载课程列表
  async loadCourseList() {
    try {
      const courses = await api.getCourses();

      if (courses && courses.length > 0) {
        // 格式化数据
        const courseList = courses.map(course => ({
          ...course,
          noteCount: course.noteCount || 0,
          updateTime: this.formatTimeAgo(course.updateTime)
        }));
        this.setData({ courseList });
      } else {
        // 使用默认数据
        this.setData({
          courseList: [
            { id: 1, name: '高等数学', noteCount: 0, updateTime: '暂无笔记' },
            { id: 2, name: '大学英语', noteCount: 0, updateTime: '暂无笔记' },
            { id: 3, name: '计算机基础', noteCount: 0, updateTime: '暂无笔记' }
          ]
        });
      }
    } catch (error) {
      console.error('加载课程失败:', error);
    }
  },

  // 加载最近笔记
  async loadRecentNotes() {
    try {
      const notes = await api.getNotes();

      if (notes && notes.length > 0) {
        // 取最近5条
        const recentNotes = notes.slice(0, 5).map(note => ({
          ...note,
          createTime: this.formatTimeAgo(note.createTime || note.updateTime)
        }));
        this.setData({ recentNotes });
      } else {
        this.setData({ recentNotes: [] });
      }
    } catch (error) {
      console.error('加载笔记失败:', error);
    }
  },

  // 格式化时间
  formatTimeAgo(timeStr) {
    if (!timeStr || timeStr === '暂无笔记') return '暂无笔记';

    const date = new Date(timeStr);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;

    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  // 拍图识别
  startOCR() {
    wx.navigateTo({
      url: '/pages/ocr/ocr'
    });
  },

  // AI 答疑
  askQuestion() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/qa/qa'
    });
  },

  // 复习页
  goToReview() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.switchTab({
      url: '/pages/review/review'
    });
  },

  // 查看全部课程
  viewAllCourses() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showToast({
      title: '课程列表功能开发中',
      icon: 'none'
    });
  },

  // 查看全部笔记
  viewAllNotes() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showToast({
      title: '笔记列表功能开发中',
      icon: 'none'
    });
  },

  // 进入课程详情
  goToCourse(e) {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const courseId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/course/course?id=${courseId}`
    });
  },

  // 进入笔记详情
  goToNote(e) {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const noteId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/note/note?id=${noteId}`
    });
  },

  // 下拉刷新
  async onPullDownRefresh() {
    await this.loadUserData();
    wx.stopPullDownRefresh();
  },

  // 跳转到搜索页
  goToSearch() {
    wx.navigateTo({
      url: '/pages/search/search'
    });
  }
});
