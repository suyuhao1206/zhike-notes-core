// pages/note/note.js
const api = require('../../api/api.js');
const util = require('../../utils/util.js');

Page({
  data: {
    noteId: null,
    note: null,
    mindMap: null,
    isLoading: true,
    isEditing: false,
    editContent: '',
    isSummarizing: false
  },

  onLoad(options) {
    const noteId = options.id;
    this.setData({ noteId });
    this.loadNoteDetail(noteId);
  },

  // 加载笔记详情
  async loadNoteDetail(noteId) {
    this.setData({ isLoading: true });

    try {
      const note = await api.getNoteById(noteId);

      if (note) {
        // 格式化时间
        note.createTimeFormatted = this.formatDateTime(note.createTime);
        note.updateTimeFormatted = this.formatDateTime(note.updateTime);

        // 如果没有摘要，尝试生成
        if (!note.summary && note.content) {
          this.generateSummary(note);
        }

        this.setData({
          note,
          isLoading: false
        });

        // 生成思维导图
        this.generateMindMap(note);
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

  // 格式化时间
  formatDateTime(timeStr) {
    if (!timeStr) return '未知时间';
    const date = new Date(timeStr);
    return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
  },

  // 生成摘要
  async generateSummary(note) {
    this.setData({ isSummarizing: true });

    try {
      const result = await api.summarizeNote(note.content);

      // 更新笔记
      note.summary = result.summary;
      note.tags = result.tags;
      await api.saveNote(note);

      this.setData({
        note,
        isSummarizing: false
      });
    } catch (error) {
      console.error('生成摘要失败:', error);
      this.setData({ isSummarizing: false });
    }
  },

  // 生成思维导图
  async generateMindMap(note) {
    if (note.mindMap) {
      this.setData({ mindMap: note.mindMap });
      return;
    }

    try {
      // 使用简单算法生成思维导图
      const content = note.content;
      const lines = content.split('\n').filter(l => l.trim());

      // 提取标题作为节点
      const mindMap = {
        title: note.title,
        children: []
      };

      let currentSection = null;

      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('##') || trimmed.startsWith('###')) {
          const title = trimmed.replace(/^#+\s*/, '');
          currentSection = { title, children: [] };
          mindMap.children.push(currentSection);
        } else if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
          const item = trimmed.replace(/^[-*]\s*/, '');
          if (currentSection) {
            currentSection.children.push(item);
          } else {
            if (mindMap.children.length === 0) {
              mindMap.children.push({ title: '要点', children: [] });
            }
            mindMap.children[0].children.push(item);
          }
        }
      });

      // 如果没有提取到内容，使用默认结构
      if (mindMap.children.length === 0) {
        mindMap.children = [
          { title: '主要内容', children: ['笔记内容'] }
        ];
      }

      this.setData({ mindMap });

      // 保存到笔记
      note.mindMap = mindMap;
      await api.saveNote(note);
    } catch (error) {
      console.error('生成思维导图失败:', error);
    }
  },

  // 开始编辑
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

  // 查看思维导图
  viewMindMap() {
    wx.showToast({
      title: '思维导图功能开发中',
      icon: 'none'
    });
  },

  // 进入AI答疑
  goToQA() {
    wx.navigateTo({
      url: `/pages/qa/qa?noteId=${this.data.noteId}`
    });
  },

  // 生成复习卷
  generateReview() {
    wx.navigateTo({
      url: `/pages/review/review?noteId=${this.data.noteId}&action=generate`
    });
  },

  // 生成背诵卡片
  generateFlashcard() {
    wx.showToast({
      title: '背诵卡片功能开发中',
      icon: 'none'
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
