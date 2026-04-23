// pages/review/review.js
const api = require('../../api/api.js');
const util = require('../../utils/util.js');
const officialKB = require('../../knowledge/officialKnowledge.js');

Page({
  data: {
    noteId: null,
    action: null,
    note: null,
    
    selectedCourse: null,
    courses: [],
    courseNotes: [],

    config: {
      questionTypes: ['选择题', '填空题', '简答题'],
      questionCount: 10,
      difficulty: 'medium'
    },
    selectedTypes: ['选择题', '填空题'],
    questionTypeOptions: [],

    reviewModes: [
      { id: 'exam', name: '复习卷', icon: '📝', desc: '生成模拟试卷练习' },
      { id: 'flashcard', name: '背诵卡片', icon: '📚', desc: 'Anki式记忆卡片' },
      { id: 'emergency', name: '急救模式', icon: '🚨', desc: '2页纸精华复习' },
      { id: 'mistakes', name: '错题本', icon: '❌', desc: '针对性练习错题' }
    ],

    exam: null,
    currentQuestion: null,
    currentQuestionDisplay: null,
    currentIndex: 0,
    answers: {},
    isFinished: false,
    score: 0,
    correctCount: 0,
    wrongCount: 0,

    mistakeList: [],

    emergencyContent: null,
    isGeneratingEmergency: false
  },

  onLoad(options) {
    this.refreshTypeOptions();
    
    const noteId = options.noteId;
    const action = options.action;

    this.setData({ noteId, action });

    if (noteId) {
      this.loadNoteAndGenerate(noteId);
    } else if (action === 'generate') {
      this.setData({ action: 'config' });
    } else if (action === 'mistakes') {
      this.setData({ action: 'mistakes' });
      this.loadMistakes();
    } else {
      this.loadCourses();
    }
  },

  onShow() {
    const app = getApp();
    if (app.globalData.generateExamNoteId) {
      const noteId = app.globalData.generateExamNoteId;
      app.globalData.generateExamNoteId = null;
      
      this.setData({ noteId });
      this.loadNoteAndGenerate(noteId);
    }
  },

  async loadNoteAndGenerate(noteId) {
    try {
      const note = await api.getNoteById(noteId);
      if (note) {
        this.setData({ 
          note,
          action: 'config',
          selectedCourse: { id: note.courseId, name: note.courseName || '未分类' },
          courseNotes: [note]
        });
      } else {
        wx.showToast({ title: '笔记不存在', icon: 'none' });
      }
    } catch (error) {
      console.error('加载笔记失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async loadCourses() {
    try {
      const courses = await api.getCourses();
      this.setData({ courses });
    } catch (error) {
      console.error('加载课程失败:', error);
    }
  },

  selectMode(e) {
    const modeId = e.currentTarget.dataset.id;
    
    if (modeId === 'mistakes') {
      this.setData({ action: 'mistakes' });
      this.loadMistakes();
    } else {
      this.setData({ action: 'selectCourse', currentMode: modeId });
      this.loadCourses();
    }
  },

  async selectCourse(e) {
    const courseId = e.currentTarget.dataset.id;
    const course = this.data.courses.find(c => String(c.id || c._id || '') === String(courseId));
    
    if (course) {
      this.setData({ 
        selectedCourse: course,
        action: this.data.currentMode
      });
      
      await this.loadCourseNotes(courseId);
      
      if (this.data.currentMode === 'exam') {
        this.setData({ action: 'config' });
      } else if (this.data.currentMode === 'flashcard') {
        this.generateFlashcards();
      } else if (this.data.currentMode === 'emergency') {
        this.generateEmergency();
      }
    }
  },

  async loadCourseNotes(courseId) {
    try {
      const notes = await api.getNotes(courseId);
      this.setData({ courseNotes: notes });
    } catch (error) {
      console.error('加载课程笔记失败:', error);
    }
  },

  async getCourseKnowledge(courseId) {
    const course = this.data.selectedCourse;
    const courseName = course ? course.name : '';
    
    let knowledge = {
      userNotes: '',
      officialKnowledge: ''
    };
    
    if (this.data.courseNotes && this.data.courseNotes.length > 0) {
      knowledge.userNotes = this.data.courseNotes.map(n => n.content).join('\n\n');
    }
    
    if (courseName && officialKB) {
      const kbResults = officialKB.getByCourse(courseName);
      if (kbResults && kbResults.length > 0) {
        knowledge.officialKnowledge = kbResults.map(k => 
          `【${k.title}】\n${k.content}`
        ).join('\n\n');
      }
    }
    
    return knowledge;
  },

  async loadMistakes() {
    try {
      const mistakes = await api.getMistakes();
      this.setData({
        mistakeList: (mistakes || []).map(item => ({
          ...item,
          id: item._id || item.id
        }))
      });
    } catch (error) {
      console.error('加载错题失败:', error);
    }
  },

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

  refreshTypeOptions() {
    const selected = this.data.selectedTypes || [];
    const questionTypes = this.data.config.questionTypes || [];
    const questionTypeOptions = questionTypes.map((name) => ({
      name,
      selected: selected.indexOf(name) > -1
    }));
    this.setData({ questionTypeOptions });
  },

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

  setQuestionCount(e) {
    const count = parseInt(e.currentTarget.dataset.count);
    this.setData({
      config: { ...this.data.config, questionCount: count }
    });
  },

  setDifficulty(e) {
    const difficulty = e.currentTarget.dataset.difficulty;
    this.setData({
      config: { ...this.data.config, difficulty }
    });
  },

  async generateExam() {
    if (this.data.selectedTypes.length === 0) {
      wx.showToast({ title: '请选择题型', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '生成试卷中...', mask: true });

    try {
      const knowledge = await this.getCourseKnowledge();
      const content = `【官方资料】\n${knowledge.officialKnowledge}\n\n【用户笔记】\n${knowledge.userNotes}`;
      
      if (!content || content.trim().length < 50) {
        wx.hideLoading();
        wx.showModal({
          title: '提示',
          content: '该课程暂无学习资料，请先添加笔记',
          showCancel: false
        });
        return;
      }
      
      let examData = null;
      
      try {
        const result = await api.generateExam(content, {
          types: this.data.selectedTypes,
          count: this.data.config.questionCount,
          difficulty: this.data.config.difficulty
        });
        examData = result.exam || result;
      } catch (apiError) {
        console.warn('API生成失败，使用本地模拟:', apiError);
        examData = this.generateMockExam();
      }

      if (!examData || !examData.questions || examData.questions.length === 0) {
        examData = this.generateMockExam();
      }

      wx.hideLoading();

      examData.totalScore = examData.questions.length * 10;

      this.setData({
        exam: examData,
        action: 'exam',
        currentIndex: 0,
        currentQuestion: examData.questions[0],
        currentQuestionDisplay: this.formatQuestionForDisplay(examData.questions[0]),
        answers: {},
        isFinished: false,
        score: 0,
        correctCount: 0,
        wrongCount: 0
      });
    } catch (error) {
      wx.hideLoading();
      console.error('生成试卷失败:', error);
      wx.showToast({ title: '生成失败: ' + error.message, icon: 'none' });
    }
  },

  generateMockExam() {
    const questions = [];
    const types = this.data.selectedTypes;
    const count = Math.min(this.data.config.questionCount, 10);
    
    for (let i = 0; i < count; i++) {
      const type = types[i % types.length];
      
      if (type === '选择题') {
        questions.push({
          type: '选择题',
          content: `这是第${i + 1}道选择题。请问以下哪个选项是正确的？`,
          options: ['A. 选项A的内容', 'B. 选项B的内容', 'C. 选项C的内容', 'D. 选项D的内容'],
          answer: 'A',
          explanation: '正确答案是A，因为...'
        });
      } else if (type === '填空题') {
        questions.push({
          type: '填空题',
          content: `这是第${i + 1}道填空题。请在横线处填写正确答案____。`,
          answer: '答案',
          explanation: '答案解析：...'
        });
      } else if (type === '简答题') {
        questions.push({
          type: '简答题',
          content: `这是第${i + 1}道简答题。请简要回答以下问题。`,
          answer: '参考答案要点...',
          explanation: '答案要点包括...'
        });
      }
    }
    
    return {
      title: '模拟练习卷',
      questions,
      totalScore: questions.length * 10
    };
  },

  async generateFlashcards() {
    wx.showLoading({ title: '生成卡片中...', mask: true });

    try {
      const knowledge = await this.getCourseKnowledge();
      const content = `【官方资料】\n${knowledge.officialKnowledge}\n\n【用户笔记】\n${knowledge.userNotes}`;
      
      if (!content || content.trim().length < 50) {
        wx.hideLoading();
        wx.showModal({
          title: '提示',
          content: '该课程暂无学习资料，请先添加笔记',
          showCancel: false
        });
        return;
      }

      let cards = [];
      
      try {
        const result = await api.generateFlashcards(content);
        if (result && result.flashcards && result.flashcards.length > 0) {
          cards = result.flashcards;
        } else {
          cards = this.generateMockCards();
        }
      } catch (apiError) {
        console.warn('API生成失败，使用本地生成:', apiError);
        cards = this.generateMockCards();
      }

      wx.hideLoading();
      
      wx.navigateTo({
        url: `/pages/flashcard/flashcard?cards=${encodeURIComponent(JSON.stringify(cards))}&courseId=${this.data.selectedCourse._id || this.data.selectedCourse.id}`
      });
    } catch (error) {
      wx.hideLoading();
      console.error('生成卡片失败:', error);
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  generateMockCards() {
    const courseName = this.data.selectedCourse ? this.data.selectedCourse.name : '课程';
    
    return [
      {
        front: `${courseName}的核心概念是什么？`,
        back: '这是核心概念的详细解释...'
      },
      {
        front: '这个知识点的应用场景有哪些？',
        back: '主要应用场景包括：1. ... 2. ... 3. ...'
      },
      {
        front: '如何理解这个公式？',
        back: '公式的推导过程：...'
      }
    ];
  },

  async generateEmergency() {
    this.setData({ isGeneratingEmergency: true });

    try {
      const knowledge = await this.getCourseKnowledge();
      const courseName = this.data.selectedCourse ? this.data.selectedCourse.name : '课程';
      
      const emergencyContent = {
        title: `${courseName} - 期末急救知识点`,
        sections: [
          {
            title: '一、核心概念',
            content: knowledge.officialKnowledge ? 
              knowledge.officialKnowledge.substring(0, 500) : 
              '核心概念整理中...'
          },
          {
            title: '二、重点公式',
            content: '重点公式整理中...'
          },
          {
            title: '三、常见题型',
            content: '常见题型整理中...'
          },
          {
            title: '四、易错点',
            content: '易错点整理中...'
          }
        ]
      };

      this.setData({
        emergencyContent,
        action: 'emergency',
        isGeneratingEmergency: false
      });
    } catch (error) {
      console.error('生成急救内容失败:', error);
      this.setData({ isGeneratingEmergency: false });
      wx.showToast({ title: '生成失败', icon: 'none' });
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
  async generateEmergencyLegacy() {
    this.setData({ isGeneratingEmergency: true });
    wx.showLoading({ title: '生成精华内容...', mask: true });

    try {
      const note = this.data.note;
      let content = note ? (note.content || '') : '';

      if (!content) {
        const knowledge = await this.getCourseKnowledge();
        content = `【官方资料】\n${knowledge.officialKnowledge}\n\n【用户笔记】\n${knowledge.userNotes}`;
      }

      if (!content || content.trim().length < 50) {
        wx.hideLoading();
        this.setData({ isGeneratingEmergency: false });
        wx.showModal({
          title: '提示',
          content: '当前课程暂无足够内容，请先添加笔记',
          showCancel: false
        });
        return;
      }

      const result = await api.generateEmergency(content);
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
  async generateFlashcardsLegacy() {
    wx.showLoading({ title: '生成卡片中...', mask: true });

    try {
      const note = this.data.note;
      const selectedCourse = this.data.selectedCourse || {};
      let content = '';
      let meta = {};

      if (note) {
        content = note.content || '';
        meta = {
          noteId: this.data.noteId || note._id || note.id || '',
          courseId: note.courseId || '',
          courseName: note.courseName || '',
          noteTitle: note.title || ''
        };
      } else {
        const knowledge = await this.getCourseKnowledge();
        content = `【官方资料】\n${knowledge.officialKnowledge}\n\n【用户笔记】\n${knowledge.userNotes}`;
        meta = {
          courseId: selectedCourse.id || selectedCourse._id || '',
          courseName: selectedCourse.name || ''
        };
      }

      if (!content || content.trim().length < 50) {
        wx.hideLoading();
        wx.showModal({
          title: '提示',
          content: '当前课程暂无足够内容，请先添加笔记',
          showCancel: false
        });
        return;
      }

      const existingCards = meta.noteId
        ? await api.getFlashcards(meta.noteId)
        : await api.getFlashcardsByCourse(meta.courseId);

      if (existingCards && existingCards.length > 0) {
        wx.hideLoading();
        wx.navigateTo({
          url: meta.noteId
            ? `/pages/flashcard/flashcard?noteId=${meta.noteId}`
            : `/pages/flashcard/flashcard?courseId=${meta.courseId}`
        });
        return;
      }

      const result = await api.generateFlashcards(content);
      const cards = result.flashcards && result.flashcards.length > 0
        ? result.flashcards
        : this.generateMockCards();

      await api.saveFlashcards(cards, meta);

      wx.hideLoading();
      wx.navigateTo({
        url: meta.noteId
          ? `/pages/flashcard/flashcard?noteId=${meta.noteId}`
          : `/pages/flashcard/flashcard?courseId=${meta.courseId}`
      });
    } catch (error) {
      wx.hideLoading();
      console.error('生成卡片失败:', error);
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  // 删除错题
  editMistake(e) {
    const mistakeId = e.currentTarget.dataset.id;
    const mistake = this.data.mistakeList.find(item => String(item._id || item.id || '') === String(mistakeId));
    if (!mistake) {
      wx.showToast({ title: '未找到错题', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '错题详情',
      content: `${mistake.question || ''}\n\n正确答案：${mistake.correctAnswer || mistake.answer || ''}\n\n解析：${mistake.explanation || '暂无解析'}`,
      showCancel: false
    });
  },

  async deleteMistake(e) {
    const mistakeId = e.currentTarget.dataset.id;
    const confirmed = await util.confirm('确定删除这道错题吗？', '确认删除');
    if (confirmed) {
      // 从本地存储删除
      await api.deleteMistake(mistakeId);
      await this.loadMistakes();
      wx.showToast({ title: '已删除', icon: 'success' });
      return;
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
