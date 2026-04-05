const api = require('../../api/api.js');

Page({
  data: {
    imagePath: '',
    recognizedText: '',
    isRecognizing: false,
    courseList: [],
    courseIndex: 0,
    saveAsNote: true,
    noteTitle: ''
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
        // 使用默认课程
        this.setData({
          courseList: [
            { id: 1, name: '高等数学' },
            { id: 2, name: '大学英语' },
            { id: 3, name: '计算机基础' },
            { id: 4, name: '数据结构' }
          ]
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
        isRecognizing: false
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
      // 如果没有配置 Token，返回模拟数据
      if (!config.token) {
        setTimeout(() => {
          resolve({
            text: '这是模拟的识别结果。在实际配置 Coze API 后，这里将返回真实的图像识别内容。\n\n识别内容示例：\n\n1. 函数 f(x) = x² 在 x=0 处取得最小值\n2. 导数 f\'(x) = 2x\n3. 当 x=0 时，f\'(0) = 0'
          });
        }, 1500);
        return;
      }

      // 上传图片到 Coze
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
              const botId = config.bots.noteSummary;

              if (!botId) {
                reject(new Error('笔记总结 Bot 未配置'));
                return;
              }

              // 调用 Bot 识别图片
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
                    reject(new Error('识别请求失败'));
                  }
                },
                fail: reject
              });
            } else {
              reject(new Error(data.msg || '图片上传失败'));
            }
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        },
        fail: reject
      });
    });
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

    const note = {
      id: Date.now(),
      courseId: course?.id,
      courseName: course?.name,
      title: this.data.noteTitle || `拍图笔记 - ${this.formatDateTime(new Date())}`,
      content: this.data.recognizedText,
      summary: '',
      imagePath: this.data.imagePath,
      createTime: new Date().toISOString()
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
        noteTitle: ''
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
            noteTitle: ''
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
