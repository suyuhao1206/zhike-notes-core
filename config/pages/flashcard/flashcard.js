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
    stats: {
      mastered: 0,
      uncertain: 0,
      difficult: 0
    }
  },

  onLoad(options) {
    // 检查是否从笔记页面传入卡片数据
    if (options.cards) {
      try {
        const cards = JSON.parse(decodeURIComponent(options.cards));
        this.initCards(cards);
      } catch (e) {
        this.loadCardsFromStorage();
      }
    } else if (options.noteId) {
      this.generateCardsFromNote(options.noteId);
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
    const flashcards = cards.map((card, index) => ({
      id: index,
      question: card.question || card.front || '问题',
      answer: card.answer || card.back || '答案',
      status: 'new', // new, mastered, uncertain, difficult
      courseId: card.courseId || '',
      noteId: card.noteId || ''
    }));

    this.setData({
      flashcards,
      currentIndex: 0,
      currentCard: flashcards[0] || {},
      loading: false,
      isFlipped: false
    });

    this.saveCardsToStorage(flashcards);
  },

  // 从本地存储加载卡片
  loadCardsFromStorage() {
    const flashcards = wx.getStorageSync('flashcards') || [];
    
    // 如果没有卡片，生成一些示例卡片
    if (flashcards.length === 0) {
      this.generateDemoCards();
      return;
    }

    this.setData({
      flashcards,
      currentIndex: 0,
      currentCard: flashcards[0],
      loading: false
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

  // 从笔记生成卡片
  generateCardsFromNote(noteId) {
    const notes = wx.getStorageSync('notes') || [];
    const note = notes.find(n => n.id === noteId);

    if (!note) {
      wx.showToast({ title: '笔记不存在', icon: 'none' });
      this.loadCardsFromStorage();
      return;
    }

    // 模拟从笔记内容生成卡片
    // 实际项目中这里应该调用 Coze API
    const cards = this.parseContentToCards(note.content);
    this.initCards(cards);

    wx.showToast({
      title: `生成${cards.length}张卡片`,
      icon: 'success'
    });
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

  // 更新卡片状态
  updateCardStatus(status) {
    const { flashcards, currentIndex } = this.data;
    flashcards[currentIndex].status = status;
    
    this.setData({ flashcards });
    this.saveCardsToStorage(flashcards);
  },

  // 下一张卡片
  nextCard() {
    const { currentIndex, flashcards } = this.data;
    
    if (currentIndex < flashcards.length - 1) {
      this.setData({
        currentIndex: currentIndex + 1,
        currentCard: flashcards[currentIndex + 1],
        isFlipped: false
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
        isFlipped: false
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
      isFlipped: false
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
      showCompleteModal: false
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
      showCompleteModal: false
    });

    this.saveCardsToStorage(flashcards);
  },

  // 保存卡片到本地存储
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
  progressPercent() {
    const { currentIndex, flashcards } = this.data;
    if (flashcards.length === 0) return 0;
    return ((currentIndex + 1) / flashcards.length) * 100;
  }
});
