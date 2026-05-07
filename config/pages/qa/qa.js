// pages/qa/qa.js
const api = require('../../api/api.js');

Page({
  data: {
    noteId: null,
    note: null,
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
    this.setData({ noteId });

    if (noteId) {
      this.loadNote(noteId);
    }

    // 加载历史问答记录
    this.loadQAHistory();
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

  // 调用 AI 答疑 API
  async callAIQA(question) {
    const noteContext = this.data.note ? this.data.note.content : '';

    try {
      const result = await api.askQuestion(question, noteContext);
      return result.answer || result;
    } catch (error) {
      console.error('AI答疑失败:', error);
      // 返回友好的错误信息
      return `抱歉，AI服务暂时不可用。\n\n错误信息：${error.message}\n\n请检查：\n1. 是否已配置Coze API Token\n2. 网络连接是否正常\n\n您也可以尝试简化问题后再次提问。`;
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