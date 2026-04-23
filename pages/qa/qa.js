// pages/qa/qa.js
const api = require('../../api/api.js');
const officialKB = require('../../knowledge/officialKnowledge.js');

Page({
  data: {
    noteId: null,
    courseId: null,
    note: null,
    courseNotes: [],
    messages: [],
    inputValue: '',
    isSending: false,
    currentQuestion: null,
    quickQuestions: [
      '这个知识点的核心是什么？',
      '能举个例子吗？',
      '这个公式怎么推导的？',
      '常见的错误有哪些？'
    ]
  },

  onLoad(options) {
    const noteId = options.noteId;
    const courseId = options.courseId;
    this.setData({ noteId, courseId });

    if (noteId) {
      this.loadNote(noteId);
    } else if (courseId) {
      this.loadCourseNotes(courseId);
    }

    // 加载历史问答记录
    this.loadQAHistory();
  },

  async loadCourseNotes(courseId) {
    try {
      const notes = await api.getNotes(courseId);
      this.setData({ courseNotes: notes || [] });
      if (notes && notes.length > 0) {
        this.generateQuickQuestions(notes.map(n => n.content || '').join('\n'));
      }
    } catch (error) {
      console.error('加载课程笔记失败:', error);
    }
  },

  // 加载笔记
  async loadNote(noteId) {
    try {
      const note = await api.getNoteById(noteId);
      this.setData({ note });

      // 根据笔记内容生成快捷问题
      if (note && note.content) {
        this.generateQuickQuestions(note.content);
      }
    } catch (error) {
      console.error('加载笔记失败:', error);
    }
  },

  // 生成快捷问题
  generateQuickQuestions(content) {
    // 根据内容长度和关键词生成快捷问题
    const questions = ['这个知识点的核心是什么？'];

    if (content.includes('公式') || content.includes('∫') || content.includes('∑')) {
      questions.push('这个公式怎么推导的？');
    }
    if (content.includes('例题') || content.includes('例')) {
      questions.push('能再举一个例子吗？');
    }
    if (content.includes('注意') || content.includes('误区')) {
      questions.push('常见的错误有哪些？');
    }

    questions.push('如何更好地记忆这个知识点？');

    this.setData({ quickQuestions: questions.slice(0, 4) });
  },

  // 加载历史问答记录
  async loadQAHistory() {
    // 从本地存储加载
    const noteId = this.data.noteId;
    const storageKey = noteId ? `qa_history_${noteId}` : 'qa_history_general';
    const history = wx.getStorageSync(storageKey) || [];

    if (history.length === 0) {
      // 添加欢迎消息
      const welcomeMsg = {
        type: 'ai',
        content: noteId
          ? '你好！我是智课笔记的AI答疑助手。我已加载当前笔记内容，你可以基于笔记提问，我会帮你解答相关问题。'
          : '你好！我是智课笔记的AI答疑助手。你可以向我提问任何学习相关的问题。',
        time: this.getCurrentTime()
      };
      this.setData({ messages: [welcomeMsg] });
    } else {
      this.setData({ messages: history });
    }
  },

  // 输入框内容变化
  onInputChange(e) {
    this.setData({ inputValue: e.detail.value });
  },

  // 发送问题
  async sendQuestion() {
    const inputValue = this.data.inputValue.trim();
    if (!inputValue) {
      wx.showToast({
        title: '请输入问题',
        icon: 'none'
      });
      return;
    }

    if (this.data.isSending) {
      return;
    }

    // 添加用户消息
    const userMessage = {
      type: 'user',
      content: inputValue,
      time: this.getCurrentTime()
    };

    const updatedMessages = [...this.data.messages, userMessage];

    this.setData({
      messages: updatedMessages,
      inputValue: '',
      isSending: true,
      currentQuestion: inputValue
    });

    // 保存到本地存储
    this.saveHistory(updatedMessages);

    // 调用 AI API 获取回答
    try {
      const answer = await this.callAIQA(inputValue);

      // 添加 AI 回复
      const aiMessage = {
        type: 'ai',
        content: answer,
        time: this.getCurrentTime()
      };

      const finalMessages = [...updatedMessages, aiMessage];

      this.setData({
        messages: finalMessages,
        isSending: false,
        currentQuestion: null
      });

      // 保存完整对话
      this.saveHistory(finalMessages);
    } catch (error) {
      wx.showToast({
        title: '请求失败',
        icon: 'none'
      });
      this.setData({ isSending: false });
    }
  },

  // 保存历史记录
  saveHistory(messages) {
    const noteId = this.data.noteId;
    const storageKey = noteId ? `qa_history_${noteId}` : 'qa_history_general';

    // 只保存最近50条消息
    const messagesToSave = messages.slice(-50);
    wx.setStorageSync(storageKey, messagesToSave);
  },

  async callAIQA(question) {
    const userContext = this.data.note
      ? this.data.note.content
      : (this.data.courseNotes || []).map(n => `【${n.title || '笔记'}】\n${n.content || ''}`).join('\n\n');
    const courseName = this.data.note
      ? this.data.note.courseName
      : ((this.data.courseNotes && this.data.courseNotes[0] && this.data.courseNotes[0].courseName) || '');
    const officialContext = courseName && officialKB && officialKB.getByCourse
      ? officialKB.getByCourse(courseName).map(k => `【${k.title}】\n${k.content}`).join('\n\n')
      : '';
    const noteContext = `【官方知识库】\n${officialContext}\n\n【用户笔记】\n${userContext}`;

    try {
      wx.showLoading({ title: 'AI思考中...', mask: true });
      
      const result = await api.askQuestion(question, noteContext);
      
      wx.hideLoading();
      
      const answer = result.answer || result.text || '抱歉，我暂时无法回答这个问题。';
      
      if (this.data.noteId && result.hasAI) {
        const noteHelper = require('../../utils/noteHelper.js');
        await noteHelper.enrichNoteWithAI(this.data.noteId, {
          question: question,
          answer: answer
        }, 'qa');
      }
      
      return answer;
    } catch (error) {
      wx.hideLoading();
      console.error('AI答疑失败:', error);
      
      return `抱歉，AI服务暂时不可用。\n\n错误信息：${error.message}\n\n建议：\n1. 检查网络连接\n2. 稍后重试\n3. 或尝试简化问题`;
    }
  },

  // 获取当前时间
  getCurrentTime() {
    const now = new Date();
    return `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
  },

  // 快捷提问
  quickQuestion(e) {
    const question = e.currentTarget.dataset.question;
    this.setData({ inputValue: question });
    this.sendQuestion();
  },

  // 清空对话
  clearMessages() {
    wx.showModal({
      title: '提示',
      content: '确定要清空所有对话记录吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ messages: [] });
          this.loadQAHistory();
        }
      }
    });
  },

  // 复制回答
  copyAnswer(e) {
    const content = e.currentTarget.dataset.content;
    wx.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({
          title: '已复制',
          icon: 'success'
        });
      }
    });
  },

  // 滚动到底部
  scrollToBottom() {
    wx.createSelectorQuery()
      .select('.message-list')
      .boundingClientRect((rect) => {
        wx.pageScrollTo({
          scrollTop: rect.height,
          duration: 300
        });
      })
      .exec();
  }
})
