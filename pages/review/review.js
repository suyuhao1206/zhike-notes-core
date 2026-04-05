// pages/review/review.js
const api = require('../../api/api.js');
const util = require('../../utils/util.js');

Page({
  data: {
    noteId: null,
    action: null,
    note: null,

    // 复习卷生成配置
    config: {
      questionTypes: ['选择题', '填空题', '简答题'],
      questionCount: 10,
      difficulty: 'medium'
    },
    selectedTypes: ['选择题', '填空题'],
    questionTypeOptions: [],

    // 复习模式列表
    reviewModes: [
      { id: 'exam', name: '复习卷', icon: '📝', desc: '生成模拟试卷练习' },
      { id: 'flashcard', name: '背诵卡片', icon: '📚', desc: 'Anki式记忆卡片' },
      { id: 'emergency', name: '急救模式', icon: '🚨', desc: '2页纸精华复习' },
      { id: 'mistakes', name: '错题本', icon: '❌', desc: '针对性练习错题' }
    ],

    // 生成的试卷
    exam: null,
    currentQuestion: null,
    currentQuestionDisplay: null,
    currentIndex: 0,
    answers: {},
    isFinished: false,
    score: 0,
    correctCount: 0,
    wrongCount: 0,

    // 错题列表
    mistakeList: [],

    // 急救模式
    emergencyContent: null,
    isGeneratingEmergency: false
  },

  onLoad(options) {
    this.refreshTypeOptions();

    const noteId = options.noteId;
    const action = options.action;

    this.setData({
      noteId,
      action
    });

    if (noteId) {
      this.loadNote(noteId);
    }

    if (action === 'generate') {
      this.setData({ action: 'config' });
    } else if (action === 'mistakes') {
      this.setData({ action: 'mistakes' });
      this.loadMistakes();
    } else {
      this.loadReviewData();
    }
  },

  // 加载笔记
  async loadNote(noteId) {
    try {
      const note = await api.getNoteById(noteId);
      this.setData({ note });
    } catch (error) {
      console.error('加载笔记失败:', error);
    }
  },

  // 加载复习数据
  async loadReviewData() {
    await this.loadMistakes();
  },

  // 加载错题本
  async loadMistakes() {
    try {
      const mistakes = await api.getMistakes();
      this.setData({ mistakeList: mistakes });
    } catch (error) {
      console.error('加载错题失败:', error);
    }
  },

  // 选择复习模式
  selectMode(e) {
    const modeId = e.currentTarget.dataset.id;

    if (modeId === 'exam') {
      if (!this.data.note) {
        wx.showToast({ title: '请从笔记页面进入', icon: 'none' });
        return;
      }
      this.setData({ action: 'config' });
    } else if (modeId === 'flashcard') {
      this.goToFlashcard();
      this.generateFlashcards();
    } else if (modeId === 'emergency') {
      this.generateEmergency();
    } else if (modeId === 'mistakes') {
      this.setData({ action: 'mistakes' });
      this.loadMistakes();
    }
  },

  // 切换题型选择
  toggleType(e) {
    const type = e.currentTarget.dataset.type;
    const selectedTypes = [...this.data.selectedTypes];

    if (selectedTypes.includes(type)) {
      selectedTypes.splice(selectedTypes.indexOf(type), 1);
    } else {
      selectedTypes.push(type);
    }

    this.setData({ selectedTypes });
    this.refreshTypeOptions();
  },

  // 刷新题型选择状态
  refreshTypeOptions() {
    const selected = this.data.selectedTypes || [];
    const questionTypes = this.data.config.questionTypes || [];
    const questionTypeOptions = questionTypes.map((name) => ({
      name,
      selected: selected.indexOf(name) > -1
    }));
    this.setData({ questionTypeOptions });
  },

  // 格式化题目显示数据，避免模板层使用函数调用
  formatQuestionForDisplay(question) {
    if (!question) return null;
    const options = question.options || [];
    const optionsDisplay = options.map((option) => {
      const label = option && option.length > 0 ? option.substring(0, 1) : '';
      const text = option && option.length > 3 ? option.substring(3) : option;
      return { raw: option, label, text };
    });
    return {
      ...question,
      optionsDisplay
    };
  },

  // 设置题量
  setQuestionCount(e) {
    const count = parseInt(e.currentTarget.dataset.count);
    this.setData({
      config: { ...this.data.config, questionCount: count }
    });
  },

  // 设置难度
  setDifficulty(e) {
    const difficulty = e.currentTarget.dataset.difficulty;
    this.setData({
      config: { ...this.data.config, difficulty }
    });
  },

  // 生成试卷
  async generateExam() {
    if (this.data.selectedTypes.length === 0) {
      wx.showToast({ title: '请选择题型', icon: 'none' });
      return;
    }

    if (!this.data.note) {
      wx.showToast({ title: '未找到笔记内容', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '生成试卷中...' });

    try {
      const result = await api.generateExam(
        this.data.note.content,
        {
          types: this.data.selectedTypes,
          count: this.data.config.questionCount,
          difficulty: this.data.config.difficulty
        }
      );

      const exam = result.exam || result;

      wx.hideLoading();

      this.setData({
        exam,
        action: 'exam',
        currentIndex: 0,
        currentQuestion: exam.questions[0],
        currentQuestionDisplay: this.formatQuestionForDisplay(exam.questions[0]),
        answers: {},
        isFinished: false,
        score: 0,
        correctCount: 0,
        wrongCount: 0
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '生成失败: ' + error.message, icon: 'none' });
    }
  },

  // 选择答案
  selectAnswer(e) {
    const answer = e.currentTarget.dataset.answer;
    const currentIndex = this.data.currentIndex;
    const answers = { ...this.data.answers };

    answers[currentIndex] = answer;
    this.setData({ answers });
  },

  // 填空题输入
  inputFillAnswer(e) {
    const answer = e.detail.value;
    const currentIndex = this.data.currentIndex;
    const answers = { ...this.data.answers };

    answers[currentIndex] = answer;
    this.setData({ answers });
  },

  // 简答题输入
  inputShortAnswer(e) {
    const answer = e.detail.value;
    const currentIndex = this.data.currentIndex;
    const answers = { ...this.data.answers };

    answers[currentIndex] = answer;
    this.setData({ answers });
  },

  // 下一题
  nextQuestion() {
    const currentIndex = this.data.currentIndex;
    const questions = this.data.exam.questions;

    if (currentIndex < questions.length - 1) {
      const nextQuestion = questions[currentIndex + 1];
      this.setData({
        currentIndex: currentIndex + 1,
        currentQuestion: nextQuestion,
        currentQuestionDisplay: this.formatQuestionForDisplay(nextQuestion)
      });
    } else {
      this.submitExam();
    }
  },

  // 提交试卷
  async submitExam() {
    const exam = this.data.exam;
    const answers = this.data.answers;
    let score = 0;
    const wrongQuestions = [];

    exam.questions.forEach((q, i) => {
      const userAnswer = answers[i];
      const isCorrect = userAnswer && userAnswer.toString().trim().toLowerCase() === q.answer.toString().trim().toLowerCase();

      if (isCorrect) {
        score += Math.floor(100 / exam.questions.length);
      } else {
        wrongQuestions.push({
          question: q.content,
          userAnswer: userAnswer || '未作答',
          correctAnswer: q.answer,
          explanation: q.explanation || ''
        });
      }
    });

    this.setData({
      isFinished: true,
      score,
      correctCount: exam.questions.length - wrongQuestions.length,
      wrongCount: wrongQuestions.length
    });

    // 保存错题
    if (wrongQuestions.length > 0) {
      for (const wrong of wrongQuestions) {
        await api.saveMistake({
          courseId: this.data.note?.courseId,
          courseName: this.data.note?.courseName || '未知课程',
          noteId: this.data.noteId,
          ...wrong
        });
      }
    }
  },

  // 生成急救模式
  async generateEmergency() {
    if (!this.data.note) {
      wx.showToast({ title: '请从笔记页面进入', icon: 'none' });
      return;
    }

    this.setData({ isGeneratingEmergency: true });
    wx.showLoading({ title: '生成精华内容...' });

    try {
      const result = await api.generateEmergency(this.data.note.content);
      this.setData({
        emergencyContent: result,
        action: 'emergency',
        isGeneratingEmergency: false
      });
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      this.setData({ isGeneratingEmergency: false });
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  // 跳转到背诵卡片页面
  goToFlashcard() {
    const noteId = this.data.noteId;
    if (noteId) {
      wx.navigateTo({
        url: `/pages/flashcard/flashcard?noteId=${noteId}`
      });
    } else {
      wx.navigateTo({
        url: '/pages/flashcard/flashcard'
      });
    }
  },

  // 生成背诵卡片
  async generateFlashcards() {
    if (!this.data.note) {
      wx.showToast({ title: '请从笔记页面进入', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '生成卡片中...' });

    try {
      const result = await api.generateFlashcards(this.data.note.content);
      this.setData({
        flashcards: result.flashcards,
        action: 'flashcards',
        currentCardIndex: 0
      });
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  // 删除错题
  async deleteMistake(e) {
    const mistakeId = e.currentTarget.dataset.id;
    const confirmed = await util.confirm('确定删除这道错题吗？', '确认删除');
    if (confirmed) {
      // 从本地存储删除
      let mistakes = wx.getStorageSync('mistakes') || [];
      mistakes = mistakes.filter(m => m.id != mistakeId);
      wx.setStorageSync('mistakes', mistakes);

      this.loadMistakes();
      wx.showToast({ title: '已删除', icon: 'success' });
    }
  },

  // 返回
  goBack() {
    const action = this.data.action;

    if (action === 'exam' || action === 'mistakes' || action === 'emergency' || action === 'flashcards') {
      this.setData({ action: null });
    } else if (action === 'config') {
      this.setData({ action: null });
    } else {
      wx.navigateBack();
    }
  }
});
