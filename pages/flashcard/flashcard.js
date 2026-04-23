// pages/flashcard/flashcard.js
const app = getApp();

Page({
  data: {
    flashcards: [],
    currentIndex: 0,
    currentCard: {},
    isFlipped: false,
    loading: true,
    showCompleteModal: false,
    noteId: '',
    courseId: '',
    progressPercent: 0,
    stats: {
      mastered: 0,
      uncertain: 0,
      difficult: 0
    }
  },

  onLoad(options) {
    this.noteId = options.noteId || '';
    this.courseId = options.courseId || '';
    this.setData({
      noteId: this.noteId,
      courseId: this.courseId
    });
    
    console.log('背诵卡片页面加载，参数:', options);
    
    if (options.cards) {
      try {
        const cards = JSON.parse(decodeURIComponent(options.cards));
        this.initCards(cards);
      } catch (e) {
        console.error('解析卡片数据失败:', e);
        this.loadCardsFromStorage();
      }
    } else if (options.noteId) {
      this.setData({ noteId: options.noteId });
      this.loadCardsFromStorage();
    } else {
      this.loadCardsFromStorage();
    }
  },

  onShow() {
    // 更新学习统计
    this.updateStudyStats();
  },

  // 初始化卡片
  initCards(cards) {
    const noteId = this.data.noteId || this.noteId || '';
    const courseId = this.data.courseId || this.courseId || '';
    
    console.log('初始化卡片，noteId:', noteId, '卡片数量:', cards.length);
    
    const flashcards = cards.map((card, index) => ({
      id: card.id || Date.now() + index,
      _id: card._id || null,
      question: card.question || card.front || '问题',
      answer: card.answer || card.back || '答案',
      status: card.status || 'new',
      courseId: card.courseId || courseId || '',
      noteId: noteId,
      createTime: card.createTime || new Date().toISOString(),
      updateTime: new Date().toISOString()
    }));

    console.log('处理后的卡片数据:', flashcards.slice(0, 2));

    this.setData({
      flashcards,
      noteId,
      currentIndex: 0,
      currentCard: flashcards[0] || {},
      loading: false,
      isFlipped: false,
      progressPercent: this.calcProgress(0, flashcards)
    });

    console.log('页面数据已设置，flashcards数量:', this.data.flashcards.length);

    this.saveCardsToCloud(flashcards);
  },

  async loadCardsFromStorage() {
    const noteId = this.data.noteId || this.noteId || '';
    const courseId = this.data.courseId || this.courseId || '';
    
    console.log('加载卡片，noteId:', noteId, 'courseId:', courseId);
    
    try {
      const api = require('../../api/api.js');
      let cloudCards = [];
      if (noteId) {
        cloudCards = await api.getFlashcards(noteId);
      } else if (courseId) {
        cloudCards = await api.getFlashcardsByCourse(courseId);
      } else {
        cloudCards = await api.getFlashcards();
      }
      
      console.log('查询到的云端卡片数量:', cloudCards ? cloudCards.length : 0);
      console.log('云端卡片数据:', cloudCards);
      
      if (cloudCards && cloudCards.length > 0) {
        this.setData({
          flashcards: cloudCards,
          currentIndex: 0,
          currentCard: cloudCards[0],
          loading: false,
          progressPercent: this.calcProgress(0, cloudCards)
        });
        wx.setStorageSync('flashcards', cloudCards);
        console.log(`✅ 加载了 ${cloudCards.length} 张卡片`);
        return;
      } else {
        console.log('云端没有找到卡片');
      }
    } catch (error) {
      console.warn('从云端加载卡片失败:', error);
    }

    if (noteId) {
      try {
        const api = require('../../api/api.js');
        const note = await api.getNoteById(noteId);
        const embeddedCards = note && note.flashcards ? note.flashcards : [];
        if (embeddedCards.length > 0) {
          this.initCards(embeddedCards);
          return;
        }
      } catch (error) {
        console.warn('从笔记内嵌卡片加载失败:', error);
      }
    }
    
    let flashcards = wx.getStorageSync('flashcards') || [];
    if (noteId) {
      flashcards = flashcards.filter(card => String(card.noteId || '') === String(noteId));
    } else if (courseId) {
      flashcards = flashcards.filter(card => String(card.courseId || '') === String(courseId));
    }
    console.log('本地缓存卡片数量:', flashcards.length);
    
    if (flashcards.length === 0) {
      wx.showToast({ 
        title: '暂无背诵卡片\n请从笔记页面生成', 
        icon: 'none',
        duration: 2000
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
      return;
    }

    this.setData({
      flashcards,
      currentIndex: 0,
      currentCard: flashcards[0],
      loading: false,
      progressPercent: this.calcProgress(0, flashcards)
    });
  },

  // 生成示例卡片
  generateDemoCards() {
    const demoCards = [
      { question: '什么是机器学习？', answer: '机器学习是人工智能的一个分支，让计算机能够从数据中学习规律，而无需明确编程。' },
      { question: '监督学习 vs 无监督学习的区别？', answer: '监督学习使用带标签的数据进行训练；无监督学习处理无标签数据，自行发现数据中的模式。' },
      { question: '过拟合是什么？如何解决？', answer: '过拟合指模型在训练数据上表现很好但在新数据上表现差。解决方法：增加数据、正则化、简化模型、交叉验证等。' },
      { question: '梯度下降的原理？', answer: '梯度下降是一种优化算法，通过计算损失函数的梯度，沿着梯度反方向更新参数，逐步最小化损失函数。' },
      { question: '什么是神经网络？', answer: '神经网络是受生物神经元启发的计算模型，由相互连接的节点（神经元）组成，能够学习复杂的非线性关系。' }
    ];

    this.initCards(demoCards);
  },

  async generateCardsFromNote(noteId) {
    wx.showLoading({ title: '生成卡片中...', mask: true });

    try {
      const api = require('../../api/api.js');
      const note = await api.getNoteById(noteId);

      if (!note) {
        wx.hideLoading();
        wx.showToast({ title: '笔记不存在', icon: 'none' });
        this.loadCardsFromStorage();
        return;
      }

      let cards = [];
      
      try {
        const result = await api.generateFlashcards(note.content);
        if (result && result.flashcards && result.flashcards.length > 0) {
          cards = result.flashcards;
        } else {
          cards = this.parseContentToCards(note.content);
        }
      } catch (apiError) {
        console.warn('API生成失败，使用本地解析:', apiError);
        cards = this.parseContentToCards(note.content);
      }

      wx.hideLoading();
      
      this.initCards(cards);

      wx.showToast({
        title: `生成${cards.length}张卡片`,
        icon: 'success'
      });
    } catch (error) {
      wx.hideLoading();
      console.error('生成卡片失败:', error);
      const cards = this.parseContentToCards('');
      this.initCards(cards);
    }
  },

  // 解析内容生成卡片（简单实现）
  parseContentToCards(content) {
    // 按段落分割，奇数段作为问题，偶数段作为答案
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
    const cards = [];
    
    for (let i = 0; i < paragraphs.length - 1; i += 2) {
      cards.push({
        question: paragraphs[i].substring(0, 100),
        answer: paragraphs[i + 1].substring(0, 200)
      });
    }

    // 如果内容太少，生成默认卡片
    if (cards.length === 0) {
      cards.push({
        question: '本笔记的核心内容是什么？',
        answer: content.substring(0, 200) || '暂无内容'
      });
    }

    return cards;
  },

  // 翻转卡片
  flipCard() {
    this.setData({
      isFlipped: !this.data.isFlipped
    });
  },

  // 标记为困难
  markDifficult() {
    this.updateCardStatus('difficult');
    this.nextCard();
  },

  // 标记为模糊
  markUncertain() {
    this.updateCardStatus('uncertain');
    this.nextCard();
  },

  // 标记为已掌握
  markMastered() {
    this.updateCardStatus('mastered');
    this.nextCard();
  },

  async updateCardStatus(status) {
    const { flashcards, currentIndex } = this.data;
    flashcards[currentIndex].status = status;
    flashcards[currentIndex].updateTime = new Date().toISOString();
    
    this.setData({ flashcards });
    wx.setStorageSync('flashcards', flashcards);
    
    try {
      const api = require('../../api/api.js');
      const card = flashcards[currentIndex];
      if (card._id) {
        await api.saveFlashcard(card);
      }
    } catch (error) {
      console.error('更新卡片状态失败:', error);
    }
  },

  // 下一张卡片
  nextCard() {
    const { currentIndex, flashcards } = this.data;
    
    if (currentIndex < flashcards.length - 1) {
      this.setData({
        currentIndex: currentIndex + 1,
        currentCard: flashcards[currentIndex + 1],
        isFlipped: false,
        progressPercent: this.calcProgress(currentIndex + 1, flashcards)
      });
    } else {
      // 完成一轮
      this.showCompleteModal();
    }
  },

  // 上一张卡片
  prevCard() {
    const { currentIndex, flashcards } = this.data;
    
    if (currentIndex > 0) {
      this.setData({
        currentIndex: currentIndex - 1,
        currentCard: flashcards[currentIndex - 1],
        isFlipped: false,
        progressPercent: this.calcProgress(currentIndex - 1, flashcards)
      });
    }
  },

  // 打乱卡片顺序
  shuffleCards() {
    const { flashcards } = this.data;
    
    // Fisher-Yates 洗牌算法
    for (let i = flashcards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [flashcards[i], flashcards[j]] = [flashcards[j], flashcards[i]];
    }

    this.setData({
      flashcards,
      currentIndex: 0,
      currentCard: flashcards[0],
      isFlipped: false,
      progressPercent: this.calcProgress(0, flashcards)
    });

    wx.showToast({ title: '已打乱顺序', icon: 'none' });
  },

  // 显示完成弹窗
  showCompleteModal() {
    const { flashcards } = this.data;
    const stats = {
      mastered: flashcards.filter(c => c.status === 'mastered').length,
      uncertain: flashcards.filter(c => c.status === 'uncertain').length,
      difficult: flashcards.filter(c => c.status === 'difficult').length
    };

    this.setData({
      showCompleteModal: true,
      stats
    });

    // 保存学习记录
    this.saveStudyRecord(stats);
  },

  // 关闭弹窗
  closeModal() {
    this.setData({ showCompleteModal: false });
  },

  // 复习困难卡片
  reviewDifficult() {
    const { flashcards } = this.data;
    const difficultCards = flashcards.filter(c => 
      c.status === 'difficult' || c.status === 'uncertain'
    );

    if (difficultCards.length === 0) {
      wx.showToast({ title: '没有需要复习的卡片', icon: 'none' });
      return;
    }

    this.setData({
      flashcards: difficultCards,
      currentIndex: 0,
      currentCard: difficultCards[0],
      isFlipped: false,
      showCompleteModal: false,
      progressPercent: this.calcProgress(0, difficultCards)
    });
  },

  // 重新开始
  restart() {
    const { flashcards } = this.data;
    
    // 重置所有卡片状态
    flashcards.forEach(card => {
      card.status = 'new';
    });

    this.setData({
      currentIndex: 0,
      currentCard: flashcards[0],
      isFlipped: false,
      showCompleteModal: false,
      progressPercent: this.calcProgress(0, flashcards)
    });

    this.saveCardsToStorage(flashcards);
  },

  async saveCardsToCloud(flashcards) {
    wx.setStorageSync('flashcards', flashcards);
    
    const api = require('../../api/api.js');
    const savedIds = [];
    
    for (const card of flashcards) {
      try {
        const savedCard = await api.saveFlashcard({
          ...card,
          updateTime: new Date().toISOString()
        });
        if (savedCard && savedCard._id) {
          card._id = savedCard._id;
        }
        savedIds.push(card.id);
        console.log('卡片保存成功:', card.id);
      } catch (error) {
        console.error('保存卡片到云端失败:', error);
      }
    }
    
    wx.setStorageSync('flashcards', flashcards);
    console.log(`已保存 ${savedIds.length} 张卡片`);
  },

  saveCardsToStorage(flashcards) {
    wx.setStorageSync('flashcards', flashcards);
  },

  // 保存学习记录
  saveStudyRecord(stats) {
    const records = wx.getStorageSync('studyRecords') || [];
    records.unshift({
      date: new Date().toISOString(),
      type: 'flashcard',
      stats,
      total: this.data.flashcards.length
    });
    
    // 只保留最近50条记录
    if (records.length > 50) {
      records.pop();
    }
    
    wx.setStorageSync('studyRecords', records);
  },

  // 更新学习统计
  updateStudyStats() {
    const today = new Date().toDateString();
    const studyStats = wx.getStorageSync('studyStats') || {};
    
    if (!studyStats[today]) {
      studyStats[today] = { cards: 0, minutes: 0 };
    }
    
    wx.setStorageSync('studyStats', studyStats);
  },

  // 跳转到笔记页面
  goToNotes() {
    wx.switchTab({
      url: '/pages/notes/notes'
    });
  },

  // 计算进度百分比
  calcProgress(currentIndex, flashcards) {
    if (flashcards.length === 0) return 0;
    return ((currentIndex + 1) / flashcards.length) * 100;
  }
});
