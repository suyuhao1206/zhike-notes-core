const api = require('../../api/api.js');

Page({
  data: {
    mistakes: [],
    filterCourse: 'all',
    filterCourseIndex: 0,
    filterCourseName: '全部',
    courses: [],
    courseOptions: [{ id: 'all', name: '全部' }],
    isLoading: false,
    stats: {
      total: 0,
      fixed: 0,
      pending: 0
    }
  },

  onLoad() {
    this.loadMistakes();
    this.loadCourses();
  },

  onShow() {
    this.loadMistakes();
  },

  // 加载错题列表
  async loadMistakes() {
    this.setData({ isLoading: true });

    try {
      const mistakes = await api.getMistakes();

      // 更新统计
      const stats = {
        total: mistakes.length,
        fixed: mistakes.filter(m => m.fixed).length,
        pending: mistakes.filter(m => !m.fixed).length
      };

      // 按时间排序（最新的在前面）
      mistakes.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

      this.setData({
        mistakes,
        stats,
        isLoading: false
      });
    } catch (error) {
      console.error('加载错题失败:', error);
      this.setData({ isLoading: false });
    }
  },

  // 加载课程列表（用于筛选）
  async loadCourses() {
    try {
      const courses = await api.getCourses();
      const courseOptions = [{ id: 'all', name: '全部' }, ...courses];
      this.setData({ 
        courses,
        courseOptions
      });
    } catch (error) {
      console.error('加载课程失败:', error);
    }
  },

  // 筛选课程
  onFilterChange(e) {
    const index = parseInt(e.detail.value);
    const selectedCourse = this.data.courseOptions[index];
    
    this.setData({ 
      filterCourseIndex: index,
      filterCourse: selectedCourse.id,
      filterCourseName: selectedCourse.name
    });
    
    this.filterMistakes(selectedCourse.id);
  },

  // 筛选错题
  filterMistakes(courseId) {
    let mistakes = wx.getStorageSync('mistakes') || [];

    if (courseId !== 'all') {
      mistakes = mistakes.filter(m => String(m.courseId) === String(courseId));
    }

    mistakes.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

    this.setData({ mistakes });
  },

  // 查看错题详情
  viewMistake(e) {
    const mistakeId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/mistakeDetail/mistakeDetail?id=${mistakeId}`
    });
  },

  // 标记为已掌握
  async markAsFixed(e) {
    const mistakeId = e.currentTarget.dataset.id;

    try {
      let mistakes = wx.getStorageSync('mistakes') || [];
      const index = mistakes.findIndex(m => m.id == mistakeId);

      if (index > -1) {
        mistakes[index].fixed = true;
        mistakes[index].fixedTime = new Date().toISOString();
        wx.setStorageSync('mistakes', mistakes);

        wx.showToast({
          title: '已标记为掌握',
          icon: 'success'
        });

        this.loadMistakes();
      }
    } catch (error) {
      console.error('标记失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  // 重新练习
  retryMistake(e) {
    const mistakeId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/mistakeDetail/mistakeDetail?id=${mistakeId}&mode=practice`
    });
  },

  // 删除错题
  deleteMistake(e) {
    const mistakeId = e.currentTarget.dataset.id;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这道错题吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          let mistakes = wx.getStorageSync('mistakes') || [];
          mistakes = mistakes.filter(m => m.id != mistakeId);
          wx.setStorageSync('mistakes', mistakes);

          wx.showToast({
            title: '删除成功',
            icon: 'success'
          });

          this.loadMistakes();
        }
      }
    });
  },

  // 开始错题复习
  startReview() {
    const pendingMistakes = this.data.mistakes.filter(m => !m.fixed);

    if (pendingMistakes.length === 0) {
      wx.showToast({
        title: '没有待复习的错题',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: '/pages/review/review?mode=mistakes'
    });
  },

  // 下拉刷新
  async onPullDownRefresh() {
    await this.loadMistakes();
    wx.stopPullDownRefresh();
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '我的错题本 - 智课笔记',
      path: '/pages/mistakes/mistakes'
    };
  }
});
