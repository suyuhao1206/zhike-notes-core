const api = require('../../api/api.js');

function sameId(a, b) {
  return String(a || '') === String(b || '');
}

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

  onShow() {
    this.loadNoteList();
  },

  async loadCourseInfo() {
    try {
      const courses = await api.getCourses();
      const course = courses.find(c => sameId(c._id, this.data.courseId) || sameId(c.id, this.data.courseId));
      
      if (course) {
        this.setData({ 
          courseInfo: {
            id: course._id || course.id,
            name: course.name,
            noteCount: 0,
            createTime: course.createTime || ''
          }
        });
      }
    } catch (error) {
      console.error('加载课程信息失败:', error);
    }
  },

  async loadNoteList() {
    try {
      const notes = await api.getNotes(this.data.courseId);
      
      const noteList = notes.map(note => ({
        ...note,
        createTime: this.formatTime(note.createTime || note.updateTime),
        summary: note.summary || (note.content ? note.content.substring(0, 50) + '...' : '暂无摘要')
      }));
      
      const courseInfo = { ...this.data.courseInfo, noteCount: noteList.length };
      
      this.setData({ noteList, courseInfo });
    } catch (error) {
      console.error('加载笔记列表失败:', error);
    }
  },

  formatTime(timeStr) {
    if (!timeStr) return '未知时间';
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

  startRecord() {
    const app = getApp();
    app.globalData.recordCourseId = this.data.courseId;
    wx.switchTab({
      url: '/pages/record/record'
    });
  },

  askQuestion() {
    wx.navigateTo({
      url: `/pages/qa/qa?courseId=${this.data.courseId}`
    });
  },

  generateExam() {
    const notes = this.data.noteList;
    if (notes.length === 0) {
      wx.showToast({ title: '请先创建笔记', icon: 'none' });
      return;
    }
    const latestNote = notes[0];
    wx.navigateTo({
      url: `/pages/review/review?noteId=${latestNote._id || latestNote.id}&action=generate`
    });
  },

  reviewCards() {
    const notes = this.data.noteList;
    if (notes.length === 0) {
      wx.showToast({ title: '请先创建笔记', icon: 'none' });
      return;
    }
    const latestNote = notes[0];
    wx.navigateTo({
      url: `/pages/flashcard/flashcard?noteId=${latestNote._id || latestNote.id}`
    });
  },

  goToNote(e) {
    const noteId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/note/note?id=${noteId}`
    });
  },

  createNote() {
    wx.navigateTo({
      url: `/pages/note-edit/note-edit?courseId=${this.data.courseId}`
    });
  }
})
