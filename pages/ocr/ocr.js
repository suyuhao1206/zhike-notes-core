const api = require('../../api/api.js');

Page({
  data: {
    imagePath: '',
    recognizedText: '',
    isRecognizing: false,
    courseList: [],
    courseIndex: 0,
    saveAsNote: true,
    noteTitle: '',
    ocrNotice: ''
  },

  onLoad() {
    this.loadCourseList();
  },

  // 加载课程列表
  async loadCourseList() {
    try {
      const courses = await api.getCourses();
      if (courses && courses.length > 0) {
        this.setData({ courseList: courses });
      } else {
        this.setData({
          courseList: []
        });
        wx.showModal({
          title: '请先创建课程',
          content: '拍照识别结果需要保存到课程下，请先创建课程。',
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

  // 选择图片
  chooseImage() {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.takePhoto();
        } else {
          this.selectFromAlbum();
        }
      }
    });
  },

  // 拍照
  takePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          imagePath: tempFilePath,
          noteTitle: `拍照笔记 - ${this.formatDateTime(new Date())}`
        });
        this.recognizeImage(tempFilePath);
      },
      fail: (err) => {
        console.error('拍照失败:', err);
      }
    });
  },

  // 从相册选择
  selectFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          imagePath: tempFilePath,
          noteTitle: `图片笔记 - ${this.formatDateTime(new Date())}`
        });
        this.recognizeImage(tempFilePath);
      },
      fail: (err) => {
        console.error('选择图片失败:', err);
      }
    });
  },

  // 识别图片
  async recognizeImage(filePath) {
    this.setData({ isRecognizing: true });

    wx.showLoading({ title: '识别中...', mask: true });

    try {
      // 调用 Coze API 进行图像识别
      const result = await this.callOCRAPI(filePath);

      wx.hideLoading();

      this.setData({
        recognizedText: result.text || '识别失败，请重试',
        isRecognizing: false,
        ocrNotice: result.isMock ? '未配置真实 OCR/视觉 Bot，当前显示的是示例整理结果；保存后仍可进入笔记、答疑和复习流程。' : ''
      });

      wx.showToast({
        title: '识别完成',
        icon: 'success'
      });

    } catch (error) {
      wx.hideLoading();
      console.error('识别失败:', error);

      this.setData({ isRecognizing: false });

      wx.showModal({
        title: '识别失败',
        content: error.message || '请检查网络连接或 Coze API 配置',
        showCancel: false
      });
    }
  },

  // 调用 OCR API
  callOCRAPI(filePath) {
    const config = api.getCozeConfig ? api.getCozeConfig() : getApp().globalData.cozeConfig;

    return new Promise((resolve, reject) => {
      if (!config.token) {
        console.log('Coze Token未配置，使用智能OCR模拟');
        setTimeout(() => {
          const mockResult = this.generateSmartOCRResult();
          resolve({ text: mockResult, isMock: true });
        }, 1000);
        return;
      }

      wx.uploadFile({
        url: `${config.baseUrl}/files/upload`,
        filePath: filePath,
        name: 'file',
        header: {
          'Authorization': `Bearer ${config.token}`
        },
        success: (uploadRes) => {
          try {
            const data = JSON.parse(uploadRes.data);
            if (data.code === 0 || data.id) {
              const fileId = data.data?.id || data.id;
              const botType = (config.bots || {}).ocrVision ? 'ocrVision' : 'noteSummary';
              const botId = (config.bots || {})[botType];

              if (!botId) {
                console.log('Bot未配置，使用智能OCR模拟');
                const mockResult = this.generateSmartOCRResult();
                resolve({ text: mockResult, isMock: true });
                return;
              }

              api.callCozeBotWithImage(botType, '请识别这张课堂图片中的文字、公式和题目，并整理成适合作为笔记保存的结构化内容。只输出识别结果、知识点、公式、题目解析和学习建议，不要输出链接。', fileId)
                .then(result => {
                  resolve({ text: result.text || result.answer || result.content || String(result || '') });
                })
                .catch(err => {
                  console.warn('Coze V3 OCR调用失败，使用模拟结果', err);
                  const mockResult = this.generateSmartOCRResult();
                  resolve({ text: mockResult, isMock: true });
                });
              return;

              wx.request({
                url: `${config.baseUrl}/chat/completions`,
                method: 'POST',
                header: {
                  'Authorization': `Bearer ${config.token}`,
                  'Content-Type': 'application/json'
                },
                data: {
                  bot_id: botId,
                  user: 'user',
                  query: `请识别图片中的文字内容并提取关键信息：file_id:${fileId}`,
                  stream: false
                },
                success: (res) => {
                  if (res.statusCode === 200 && res.data) {
                    const content = res.data.choices?.[0]?.message?.content ||
                                   res.data.choices?.[0]?.text ||
                                   res.data.text ||
                                   JSON.stringify(res.data);
                    resolve({ text: content });
                  } else {
                    const mockResult = this.generateSmartOCRResult();
                    resolve({ text: mockResult, isMock: true });
                  }
                },
                fail: (err) => {
                  console.warn('API调用失败，使用模拟结果:', err);
                  const mockResult = this.generateSmartOCRResult();
                  resolve({ text: mockResult, isMock: true });
                }
              });
            } else {
              const mockResult = this.generateSmartOCRResult();
              resolve({ text: mockResult, isMock: true });
            }
          } catch (e) {
            console.warn('解析失败，使用模拟结果:', e);
            const mockResult = this.generateSmartOCRResult();
            resolve({ text: mockResult, isMock: true });
          }
        },
        fail: (err) => {
          console.warn('上传失败，使用模拟结果:', err);
          const mockResult = this.generateSmartOCRResult();
          resolve({ text: mockResult, isMock: true });
        }
      });
    });
  },

  generateSmartOCRResult() {
    const templates = [
      `【图片识别内容】\n\n一、主要知识点\n1. 核心概念的定义和理解\n2. 基本原理的推导过程\n3. 重要公式的应用方法\n\n二、重点内容\n• 重点一：这是图片中的第一个重要内容\n• 重点二：这是图片中的第二个重要内容\n• 重点三：这是图片中的第三个重要内容\n\n三、注意事项\n- 注意理解基本概念\n- 注意掌握核心方法\n- 注意实际应用场景\n\n四、拓展思考\n建议结合教材相关章节进行深入学习，多做练习巩固理解。`,
      
      `【识别结果】\n\n本图片包含以下主要内容：\n\n【概念解析】\n主要讲解了基本概念和定义，需要重点理解其内涵和外延。\n\n【定理/公式】\n图片中包含了重要的定理或公式，建议熟练掌握其推导过程和应用方法。\n\n【例题分析】\n通过具体例子讲解了如何应用所学知识解决实际问题。\n\n【关键要点】\n✓ 要点1：理解基本概念\n✓ 要点2：掌握核心方法\n✓ 要点3：注意应用技巧\n\n建议将此内容整理到笔记中，方便后续复习。`,
      
      `【图片内容提取】\n\n本图片为学习资料，包含以下内容：\n\n1. 基础知识部分\n   - 概念定义\n   - 基本性质\n   - 适用范围\n\n2. 核心内容部分\n   - 重要定理\n   - 关键公式\n   - 典型例题\n\n3. 拓展内容部分\n   - 应用实例\n   - 注意事项\n   - 常见错误\n\n【学习建议】\n建议先理解概念，再掌握方法，最后通过练习巩固。注意标记重点和难点内容。`
    ];
    
    return templates[Math.floor(Math.random() * templates.length)];
  },

  // 重新识别
  retryRecognize() {
    if (this.data.imagePath) {
      this.recognizeImage(this.data.imagePath);
    }
  },

  // 标题输入
  onTitleInput(e) {
    this.setData({ noteTitle: e.detail.value });
  },

  // 切换保存选项
  toggleSaveAsNote(e) {
    this.setData({ saveAsNote: e.detail.value });
  },

  // 课程选择变化
  onCourseChange(e) {
    this.setData({ courseIndex: parseInt(e.detail.value) });
  },

  // 保存为笔记
  async saveAsNoteHandler() {
    if (!this.data.recognizedText) {
      wx.showToast({
        title: '没有可保存的内容',
        icon: 'none'
      });
      return;
    }

    const course = this.data.courseList[this.data.courseIndex];
    if (!course) {
      wx.showToast({ title: '请先选择课程', icon: 'none' });
      return;
    }

    const note = {
      id: Date.now(),
      courseId: course.id || course._id,
      courseName: course.name,
      title: this.data.noteTitle || `拍图笔记 - ${this.formatDateTime(new Date())}`,
      content: this.data.recognizedText,
      summary: '',
      imagePath: this.data.imagePath,
      createTime: new Date().toISOString(),
      source: 'ocr',
      isMockOcr: !!this.data.ocrNotice
    };

    try {
      await api.saveNote(note);

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      // 清空当前内容
      this.setData({
        imagePath: '',
        recognizedText: '',
        noteTitle: '',
        ocrNotice: ''
      });

    } catch (error) {
      console.error('保存失败:', error);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  },

  // 复制文本
  copyText() {
    if (!this.data.recognizedText) return;

    wx.setClipboardData({
      data: this.data.recognizedText,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        });
      }
    });
  },

  // 清空
  clearAll() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空当前内容吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            imagePath: '',
            recognizedText: '',
            noteTitle: '',
            ocrNotice: ''
          });
        }
      }
    });
  },

  // 格式化日期时间
  formatDateTime(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
});
