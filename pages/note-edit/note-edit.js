const api = require('../../api/api.js');

Page({
  data: {
    noteId: null,
    courseId: null,
    courses: [],
    courseIndex: 0,
    selectedCourse: null,
    title: '',
    content: '',
    isSaving: false,
    isAutoSaving: false,
    wordCount: 0,
    lastSaveTime: ''
  },

  onLoad(options) {
    const courseId = options.courseId || null;
    const noteId = options.noteId || null;
    
    this.setData({ courseId, noteId });
    
    if (noteId) {
      this.loadNote(noteId);
    } else {
      this.loadCourses();
    }
  },

  async loadCourses() {
    try {
      const courses = await api.getCourses();
      if (courses && courses.length > 0) {
        let courseIndex = 0;
        if (this.data.courseId) {
          const idx = courses.findIndex(c => String(c.id || '') === String(this.data.courseId) || String(c._id || '') === String(this.data.courseId));
          if (idx > -1) courseIndex = idx;
        }
        this.setData({ 
          courses, 
          courseIndex,
          selectedCourse: courses[courseIndex]
        });
      } else {
        this.setData({
          courses: [],
          selectedCourse: null
        });
        wx.showModal({
          title: '请先创建课程',
          content: '笔记需要归属到课程，创建课程后再记录会更清晰。',
          confirmText: '去创建',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({ url: '/pages/courses/courses' });
            }
          }
        });
      }
    } catch (error) {
      console.error('加载课程失败:', error);
    }
  },

  async loadNote(noteId) {
    try {
      const note = await api.getNoteById(noteId);
      if (note) {
        await this.loadCourses();
        
        let courseIndex = 0;
        if (note.courseId && this.data.courses.length > 0) {
          const idx = this.data.courses.findIndex(c => String(c.id || '') === String(note.courseId) || String(c._id || '') === String(note.courseId));
          if (idx > -1) courseIndex = idx;
        }
        
        this.setData({
          title: note.title || '',
          content: note.content || '',
          courseIndex,
          selectedCourse: this.data.courses[courseIndex] || this.data.courses[0],
          wordCount: (note.content || '').length,
          existingNote: note
        });
        
        wx.setNavigationBarTitle({ title: '编辑笔记' });
      }
    } catch (error) {
      console.error('加载笔记失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onCourseChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({
      courseIndex: index,
      selectedCourse: this.data.courses[index]
    });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onContentInput(e) {
    const content = e.detail.value;
    this.setData({
      content,
      wordCount: content.length
    });
    
    this.autoSave();
  },

  autoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setTimeout(() => {
      if (this.data.title || this.data.content) {
        this.saveNote(true);
      }
    }, 2000);
  },

  async saveNote(isAutoSave = false) {
    if (!this.data.title.trim() && !this.data.content.trim()) {
      if (!isAutoSave) {
        wx.showToast({ title: '请输入标题或内容', icon: 'none' });
      }
      return;
    }

    if (isAutoSave) {
      this.setData({ isAutoSaving: true });
    } else {
      this.setData({ isSaving: true });
    }

    try {
      const course = this.data.selectedCourse;
      const existingNote = this.data.existingNote;

      if (!course) {
        this.setData({ isSaving: false, isAutoSaving: false });
        if (!isAutoSave) {
          wx.showToast({ title: '请先选择课程', icon: 'none' });
        }
        return;
      }
      
      const noteData = {
        courseId: course ? (course.id || course._id) : null,
        courseName: course ? course.name : '未分类',
        title: this.data.title.trim() || '无标题笔记',
        content: this.data.content,
        updateTime: new Date().toISOString()
      };

      if (existingNote) {
        noteData.id = existingNote.id;
        noteData._id = existingNote._id;
        noteData.createTime = existingNote.createTime;
        noteData.summary = existingNote.summary;
        noteData.tags = existingNote.tags;
        noteData.mindMap = existingNote.mindMap;
      } else {
        noteData.id = Date.now();
        noteData.createTime = new Date().toISOString();
      }

      const savedNote = await api.saveNote(noteData);
      
      if (!existingNote && savedNote) {
        this.setData({ 
          existingNote: savedNote,
          noteId: savedNote.id
        });
      }
      
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      this.setData({
        isSaving: false,
        isAutoSaving: false,
        lastSaveTime: timeStr
      });

      if (!isAutoSave) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/note/note?id=${savedNote._id || savedNote.id || noteData._id || noteData.id}`
          });
        }, 1500);
      }
    } catch (error) {
      console.error('保存笔记失败:', error);
      this.setData({ isSaving: false, isAutoSaving: false });
      if (!isAutoSave) {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    }
  },

  async generateSummary() {
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请先输入内容', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '生成摘要中...' });

    try {
      const result = await api.summarizeNote(this.data.content);
      wx.hideLoading();

      if (result && result.summary) {
        this.setData({
          content: this.data.content + '\n\n---\n📝 摘要：\n' + result.summary
        });
        wx.showToast({ title: '已添加摘要', icon: 'success' });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  insertTemplate() {
    const templates = [
      {
        title: '课堂笔记模板',
        content: '## 课程信息\n- 课程名称：\n- 授课教师：\n- 日期：\n\n## 主要内容\n\n### 1. \n\n### 2. \n\n### 3. \n\n## 重点难点\n\n## 课后思考\n'
      },
      {
        title: '复习提纲模板',
        content: '## 复习主题\n\n## 核心概念\n\n## 公式/定理\n\n## 例题解析\n\n## 易错点\n\n## 拓展知识\n'
      },
      {
        title: '读书笔记模板',
        content: '## 书籍信息\n- 书名：\n- 作者：\n- 章节：\n\n## 主要观点\n\n## 精彩摘录\n\n## 个人思考\n\n## 行动计划\n'
      }
    ];

    wx.showActionSheet({
      itemList: templates.map(t => t.title),
      success: (res) => {
        const template = templates[res.tapIndex];
        if (!this.data.title) {
          this.setData({ title: template.title.replace('模板', '') });
        }
        this.setData({
          content: this.data.content ? this.data.content + '\n\n' + template.content : template.content
        });
      }
    });
  },

  onUnload() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
  }
});
