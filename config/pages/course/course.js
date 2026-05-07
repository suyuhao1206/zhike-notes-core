Page({
  data: {
    courseId: null,
    courseInfo: {
      name: '',
      noteCount: 0,
      createTime: ''
    },
    noteList: []
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ courseId: options.id });
      this.loadCourseInfo();
      this.loadNoteList();
    }
  },

  // 加载课程信息
  async loadCourseInfo() {
    // TODO: 从 API 加载课程信息
    const courseInfo = {
      id: this.data.courseId,
      name: '高等数学',
      noteCount: 12,
      createTime: '2026-03-01'
    };
    
    this.setData({ courseInfo });
  },

  // 加载笔记列表
  async loadNoteList() {
    // TODO: 从 API 加载笔记列表
    const noteList = [
      { 
        id: 1, 
        title: '不定积分的概念和计算方法', 
        summary: '本节讲解了不定积分的基本概念和计算方法...',
        createTime: '2 小时前',
        tag: '第 3 章'
      },
      { 
        id: 2, 
        title: '定积分的应用', 
        summary: '定积分在几何和物理中的应用...',
        createTime: '昨天',
        tag: '第 4 章'
      }
    ];
    
    this.setData({ noteList });
  },

  // 开始录音
  startRecord() {
    wx.navigateTo({
      url: '/pages/record/record?courseId=' + this.data.courseId
    });
  },

  // AI 答疑
  askQuestion() {
    wx.navigateTo({
      url: '/pages/qa/qa?courseId=' + this.data.courseId
    });
  },

  // 生成试卷
  generateExam() {
    wx.navigateTo({
      url: '/pages/review/review?courseId=' + this.data.courseId
    });
  },

  // 复习卡片
  reviewCards() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 进入笔记详情
  goToNote(e) {
    const noteId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/note/note?id=${noteId}`
    });
  }
})
