// pages/welcome/welcome.js
Page({
  data: {
    currentStep: 0,
    steps: [
      {
        title: '欢迎来到智课笔记',
        desc: '基于大语言模型的智能学习助手',
        icon: '📚'
      },
      {
        title: '录音转文字',
        desc: '课堂录音自动转写成笔记，再也不怕漏听重点',
        icon: '🎙️'
      },
      {
        title: 'AI智能答疑',
        desc: '基于笔记内容，AI为你答疑解惑',
        icon: '🤖'
      },
      {
        title: '智能复习',
        desc: '自动生成复习卷、错题本，高效复习',
        icon: '📝'
      }
    ]
  },

  onLoad() {
    // 检查是否是首次使用
    const hasSeenWelcome = wx.getStorageSync('has_seen_welcome');
    if (hasSeenWelcome) {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  // 下一步
  nextStep() {
    if (this.data.currentStep < this.data.steps.length - 1) {
      this.setData({ currentStep: this.data.currentStep + 1 });
    } else {
      this.enterApp();
    }
  },

  // 跳过引导
  skipWelcome() {
    this.enterApp();
  },

  // 进入应用
  enterApp() {
    wx.setStorageSync('has_seen_welcome', true);
    
    // 创建示例数据
    this.createDemoData();
    
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 创建示例数据
  createDemoData() {
    const demoCourses = [
      { id: 'course_demo_1', name: '机器学习基础', category: '计算机', color: '#1aad19', noteCount: 3, createTime: Date.now() },
      { id: 'course_demo_2', name: '高等数学', category: '数学', color: '#10aeff', noteCount: 2, createTime: Date.now() - 86400000 }
    ];

    const demoNotes = [
      {
        id: 'note_demo_1',
        courseId: 'course_demo_1',
        courseName: '机器学习基础',
        title: '监督学习简介',
        content: '监督学习是机器学习的一种方法，通过已有的输入输出数据训练模型。\n\n主要类型：\n1. 分类问题 - 预测离散类别\n2. 回归问题 - 预测连续值\n\n常用算法：\n- 线性回归\n- 逻辑回归\n- 决策树\n- 支持向量机\n- 神经网络',
        tags: ['机器学习', '监督学习'],
        createTime: Date.now() - 172800000,
        updateTime: Date.now() - 86400000,
        isArchived: false,
        hasRecording: false
      },
      {
        id: 'note_demo_2',
        courseId: 'course_demo_1',
        courseName: '机器学习基础',
        title: '神经网络基础',
        content: '神经网络是受生物神经系统启发的计算模型。\n\n基本组成：\n- 输入层：接收特征数据\n- 隐藏层：提取特征\n- 输出层：产生预测结果\n\n激活函数：\n- ReLU: f(x) = max(0, x)\n- Sigmoid: f(x) = 1/(1+e^(-x))\n- Tanh: f(x) = (e^x - e^(-x))/(e^x + e^(-x))',
        tags: ['神经网络', '深度学习'],
        createTime: Date.now() - 259200000,
        updateTime: Date.now() - 172800000,
        isArchived: false,
        hasRecording: true
      },
      {
        id: 'note_demo_3',
        courseId: 'course_demo_2',
        courseName: '高等数学',
        title: '导数的概念',
        content: '导数是函数变化率的度量。\n\n定义：\nf\'(x) = lim(h→0) [f(x+h) - f(x)]/h\n\n几何意义：\n导数表示函数图像在某点处切线的斜率。\n\n基本求导法则：\n1. (c)\' = 0 （常数）\n2. (x^n)\' = nx^(n-1) （幂函数）\n3. (e^x)\' = e^x\n4. (ln x)\' = 1/x',
        tags: ['微积分', '导数'],
        createTime: Date.now() - 345600000,
        updateTime: Date.now() - 259200000,
        isArchived: false,
        hasRecording: false
      }
    ];

    const demoMistakes = [
      {
        id: 'mistake_demo_1',
        noteId: 'note_demo_2',
        courseId: 'course_demo_1',
        title: 'ReLU激活函数的缺点',
        question: 'ReLU激活函数的主要缺点是什么？',
        userAnswer: '计算复杂度高',
        correctAnswer: '可能导致神经元死亡（Dead ReLU问题）',
        explanation: '当输入为负数时，ReLU输出为0，如果大量神经元输出为0，这些神经元就无法再学习，称为Dead ReLU。',
        tags: ['神经网络', 'ReLU'],
        createTime: Date.now() - 86400000,
        reviewCount: 1,
        lastReviewTime: Date.now() - 43200000
      }
    ];

    // 保存示例数据
    const existingCourses = wx.getStorageSync('courses') || [];
    const existingNotes = wx.getStorageSync('notes') || [];
    const existingMistakes = wx.getStorageSync('mistakes') || [];

    if (existingCourses.length === 0) {
      wx.setStorageSync('courses', demoCourses);
    }
    if (existingNotes.length === 0) {
      wx.setStorageSync('notes', demoNotes);
    }
    if (existingMistakes.length === 0) {
      wx.setStorageSync('mistakes', demoMistakes);
    }
  }
});
