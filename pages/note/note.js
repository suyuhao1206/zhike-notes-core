// pages/note/note.js
const api = require('../../api/api.js');
const util = require('../../utils/util.js');

function normalizeMindMap(raw, fallbackTitle) {
  if (!raw) return null;

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      return {
        title: fallbackTitle || '知识结构',
        children: raw.split(/\n+/).filter(Boolean).slice(0, 12).map(line => ({
          name: line.replace(/^[-*\d.、\s]+/, ''),
          children: []
        }))
      };
    }
  }

  const children = raw.children || raw.nodes || raw.items || [];
  return {
    title: raw.title || raw.name || fallbackTitle || '知识结构',
    children: children.map(item => ({
      name: item.name || item.title || item.text || '知识点',
      children: item.children || item.items || item.points || []
    }))
  };
}

Page({
  data: {
    noteId: null,
    note: null,
    mindMap: null,
    isLoading: true,
    isEditing: false,
    editContent: '',
    isGeneratingCards: false,
    existingCards: null,
    showFullMindMap: false,
    isGeneratingMindMap: false,
    mindMapPreviewSections: [],
    mindMapSections: []
  },

  onLoad(options) {
    const noteId = options.id;
    if (!noteId) {
      wx.showToast({ title: '笔记ID无效', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ noteId });
    this.loadNoteDetail(noteId);
  },

  async loadNoteDetail(noteId) {
    this.setData({ isLoading: true });

    try {
      const note = await api.getNoteById(noteId);

      if (note) {
        note.createTimeFormatted = this.formatDateTime(note.createTime);
        note.updateTimeFormatted = this.formatDateTime(note.updateTime);
        note.title = note.title || '无标题笔记';
        note.courseName = note.courseName || '未分类';
        note.content = note.content || '';
        note.tags = note.tags || [];

        const mindMap = normalizeMindMap(note.mindMap, note.title);

        this.setData({
          note,
          mindMap,
          mindMapPreviewSections: this.buildMindMapSections(mindMap, true),
          mindMapSections: this.buildMindMapSections(mindMap, false),
          isLoading: false
        });
      } else {
        wx.showToast({ title: '笔记不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      }
    } catch (error) {
      console.error('加载笔记失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ isLoading: false });
    }
  },

  formatDateTime(timeStr) {
    if (!timeStr) return '未知时间';
    const date = new Date(timeStr);
    return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
  },

  buildMindMapSections(mindMap, preview) {
    if (!mindMap || !mindMap.children) return [];

    const sections = preview ? mindMap.children.slice(0, 3) : mindMap.children;
    return sections.map(section => {
      const children = section.children || section.items || section.points || [];
      const visibleChildren = preview ? children.slice(0, 2) : children;

      return {
        name: section.name || section.title || section.text || '知识点',
        moreCount: preview ? Math.max(children.length - visibleChildren.length, 0) : 0,
        children: visibleChildren.map(item => ({
          name: item.name || item.title || item.text || String(item),
          children: item.children || item.items || item.points || []
        }))
      };
    });
  },

  startEdit() {
    this.setData({
      isEditing: true,
      editContent: this.data.note.content
    });
  },

  // 保存编辑
  async saveEdit() {
    const note = { ...this.data.note, content: this.data.editContent };

    try {
      await api.saveNote(note);
      this.setData({
        note,
        isEditing: false
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // 取消编辑
  cancelEdit() {
    this.setData({ isEditing: false });
  },

  // 输入内容
  onInput(e) {
    this.setData({ editContent: e.detail.value });
  },

  // 分享笔记
  shareNote() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  async viewMindMap() {
    if (this.data.isGeneratingMindMap) {
      wx.showToast({ title: '正在生成中...', icon: 'none' });
      return;
    }

    if (this.data.mindMap) {
      wx.showModal({
        title: '已有思维导图',
        content: '这篇笔记已经生成过思维导图，可以直接查看；如果笔记内容有变化，也可以重新生成。',
        confirmText: '直接查看',
        cancelText: '重新生成',
        success: (res) => {
          if (res.confirm) {
            this.setData({ showFullMindMap: true });
          } else {
            this.setData({
              mindMap: null,
              showFullMindMap: false
            });
            this.viewMindMap();
          }
        }
      });
      return;
    }

    if (!this.data.note || !this.data.note.content) {
      wx.showToast({ title: '笔记内容为空', icon: 'none' });
      return;
    }

    this.setData({ isGeneratingMindMap: true });
    wx.showLoading({ title: 'AI分析生成中...', mask: true });

    try {
      const result = await api.summarizeNote(this.data.note.content);
      wx.hideLoading();

      console.log('🔍 AI分析返回结果:', result);

      if (result) {
        const note = this.data.note;
        
        if (result.summary) {
          note.summary = result.summary;
          console.log('✅ 摘要已设置:', result.summary);
        }
        if (result.tags) {
          note.tags = result.tags;
          console.log('✅ 标签已设置:', result.tags);
        }
        const mindMap = normalizeMindMap(result.mindMap || result.mindmap || result.structure || {
          title: note.title || '知识结构',
          children: (result.tags || []).map(tag => ({ name: tag, children: [] }))
        }, note.title);
        note.mindMap = mindMap;
        console.log('✅ 思维导图已设置:', mindMap);

        await api.saveNote(note);
        
        this.setData({
          note,
          mindMap,
          mindMapPreviewSections: this.buildMindMapSections(mindMap, true),
          mindMapSections: this.buildMindMapSections(mindMap, false),
          showFullMindMap: true,
          isGeneratingMindMap: false
        });

        console.log('✅ 页面数据已更新，mindMap:', this.data.mindMap);

        wx.showToast({ title: '生成成功', icon: 'success' });
      } else {
        this.setData({ isGeneratingMindMap: false });
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 生成失败:', error);
      this.setData({ isGeneratingMindMap: false });
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  goToQA() {
    wx.navigateTo({
      url: `/pages/qa/qa?noteId=${this.data.noteId}`
    });
  },

  generateReview() {
    const app = getApp();
    app.globalData.generateExamNoteId = this.data.noteId;
    
    wx.switchTab({
      url: '/pages/review/review',
      success: () => {
        console.log('跳转到复习页面成功');
      },
      fail: (err) => {
        console.error('跳转失败:', err);
        wx.showToast({ title: '跳转失败', icon: 'none' });
      }
    });
  },

  async generateFlashcard() {
    if (!this.data.note || !this.data.note.content) {
      wx.showToast({ title: '笔记内容为空', icon: 'none' });
      return;
    }

    if (this.data.isGeneratingCards) {
      wx.showToast({ title: '正在生成中...', icon: 'none' });
      return;
    }

    try {
      const api = require('../../api/api.js');
      const cloudCards = await api.getFlashcards(this.data.noteId);
      const embeddedCards = (this.data.note && this.data.note.flashcards) || [];
      const existingCards = cloudCards && cloudCards.length > 0 ? cloudCards : embeddedCards;
      
      if (existingCards && existingCards.length > 0) {
        wx.showModal({
          title: '提示',
          content: `该笔记已有${existingCards.length}张卡片，是否查看？`,
          confirmText: '查看',
          cancelText: '重新生成',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: `/pages/flashcard/flashcard?noteId=${this.data.noteId}`
              });
            } else {
              this.doGenerateCards();
            }
          }
        });
        return;
      }
      
      this.doGenerateCards();
    } catch (error) {
      console.error('检查卡片失败:', error);
      this.doGenerateCards();
    }
  },

  async doGenerateCards() {
    this.setData({ isGeneratingCards: true });
    wx.showLoading({ title: '生成卡片中...', mask: true });

    try {
      const result = await api.generateFlashcards(this.data.note.content);
      wx.hideLoading();

      console.log('生成卡片结果:', result);

      if (result && result.flashcards && result.flashcards.length > 0) {
        const note = this.data.note;
        const savedCards = await api.saveFlashcards(result.flashcards, {
          noteId: this.data.noteId,
          courseId: note.courseId || '',
          courseName: note.courseName || '',
          noteTitle: note.title || ''
        });

        note.flashcards = savedCards;
        note.flashcardCount = savedCards.length;
        note.updateTime = new Date().toISOString();
        await api.saveNote(note);
        this.setData({ note });

        wx.navigateTo({
          url: `/pages/flashcard/flashcard?noteId=${this.data.noteId}`,
          fail: (err) => {
            console.error('跳转失败:', err);
            wx.showToast({ title: '跳转失败，请重试', icon: 'none' });
          }
        });
      } else {
        wx.showToast({ title: '未生成卡片', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('生成卡片失败:', error);
      wx.showToast({ title: '生成失败: ' + (error.message || '未知错误'), icon: 'none' });
    } finally {
      this.setData({ isGeneratingCards: false });
    }
  },

  goToEdit() {
    wx.navigateTo({
      url: `/pages/note-edit/note-edit?noteId=${this.data.noteId}`
    });
  },

  // 删除笔记
  async deleteNote() {
    const confirmed = await util.confirm('删除后无法恢复，确定删除吗？', '确认删除');
    if (confirmed) {
      try {
        await api.deleteNote(this.data.noteId);
        wx.showToast({ title: '删除成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      } catch (error) {
        wx.showToast({ title: '删除失败', icon: 'none' });
      }
    }
  },

  // 分享给朋友
  onShareAppMessage() {
    return {
      title: this.data.note.title,
      path: `/pages/note/note?id=${this.data.noteId}`
    };
  }
});
