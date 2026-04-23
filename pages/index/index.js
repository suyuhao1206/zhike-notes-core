// pages/index/index.js
const api = require('../../api/api.js');

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    courseList: [],
    recentNotes: [],
    showQuickMenu: false
  },

  onLoad() {
    this.loadUserData();
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadUserData();
  },

  async loadUserData() {
    const app = getApp();
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    const isLoggedIn = !!(token && userInfo);

    this.setData({
      isLoggedIn: isLoggedIn,
      userInfo: userInfo || app.globalData.userInfo
    });

    app.globalData.isLoggedIn = isLoggedIn;
    if (userInfo) {
      app.globalData.userInfo = userInfo;
    }

    await this.loadCourseList();
    await this.loadRecentNotes();
  },

  async loadCourseList() {
    try {
      const courses = await api.getCourses();
      const notes = await api.getNotes();
      
      const courseList = courses.map(course => {
        const courseId = course._id || course.id;
        const noteCount = notes.filter(n => n.courseId === course.id || n.courseId === course._id || n.courseId === courseId).length;
        const courseNotes = notes.filter(n => n.courseId === course.id || n.courseId === course._id || n.courseId === courseId);
        const latestNote = courseNotes[0];
        
        return {
          ...course,
          id: courseId,
          noteCount,
          updateTime: latestNote ? this.formatTimeAgo(latestNote.updateTime || latestNote.createTime) : '暂无笔记'
        };
      });
      
      this.setData({ courseList });
    } catch (error) {
      console.error('加载课程失败:', error);
      this.setData({ courseList: [] });
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
    wx.navigateTo({
      url: '/pages/courses/courses'
    });
  },

  viewAllNotesLegacy() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/notes/notes'
    });
  },

  // 查看全部笔记
  viewAllNotes() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/notes/notes'
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
  },

  // 显示快速创建菜单
  showQuickCreate() {
    this.setData({ showQuickMenu: true });
  },

  // 隐藏快速创建菜单
  hideQuickCreate() {
    this.setData({ showQuickMenu: false });
  },

  // 创建课程
  createCourse() {
    this.hideQuickCreate();
    wx.navigateTo({
      url: '/pages/courses/courses'
    });
  },

  // 创建笔记
  createNote() {
    this.hideQuickCreate();
    if (this.data.courseList.length === 0) {
      wx.showModal({
        title: '提示',
        content: '请先创建课程',
        confirmText: '去创建',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/courses/courses'
            });
          }
        }
      });
      return;
    }
    wx.navigateTo({
      url: '/pages/note-edit/note-edit'
    });
  },

  // 开始录音
  startRecord() {
    this.hideQuickCreate();
    wx.switchTab({
      url: '/pages/record/record'
    });
  }
});
