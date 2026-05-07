const api = require('../../api/api.js')

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
    this.loadCourseList()
  },

  async loadCourseList() {
    try {
      const courses = await api.getCourses()
      this.setData({ courseList: courses || [] })

      if (!courses || courses.length === 0) {
        wx.showModal({
          title: '请先创建课程',
          content: '拍照识别结果需要保存到课程下，请先创建课程。',
          confirmText: '去创建',
          success: res => {
            if (res.confirm) wx.navigateTo({ url: '/pages/courses/courses' })
          }
        })
      }
    } catch (error) {
      console.error('Failed to load courses:', error)
    }
  },

  chooseImage() {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: res => {
        if (res.tapIndex === 0) {
          this.takePhoto()
        } else {
          this.selectFromAlbum()
        }
      }
    })
  },

  takePhoto() {
    this.chooseImageFrom(['camera'], '拍照笔记')
  },

  selectFromAlbum() {
    this.chooseImageFrom(['album'], '图片笔记')
  },

  chooseImageFrom(sourceType, titlePrefix) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType,
      success: res => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({
          imagePath: tempFilePath,
          noteTitle: `${titlePrefix} - ${this.formatDateTime(new Date())}`
        })
        this.recognizeImage(tempFilePath)
      },
      fail: error => console.error('Image selection failed:', error)
    })
  },

  async recognizeImage(filePath) {
    this.setData({ isRecognizing: true })
    wx.showLoading({ title: '识别中...', mask: true })

    try {
      const result = await this.callOCRAPI(filePath)
      wx.hideLoading()

      this.setData({
        recognizedText: result.text || '识别失败，请重试',
        isRecognizing: false,
        ocrNotice: result.isMock ? '云端 OCR 暂不可用，当前显示示例整理结果。' : ''
      })

      wx.showToast({ title: '识别完成', icon: 'success' })
    } catch (error) {
      wx.hideLoading()
      this.setData({ isRecognizing: false })
      wx.showModal({
        title: '识别失败',
        content: error.message || '请检查网络连接或 aiRouter 云函数配置',
        showCancel: false
      })
    }
  },

  async callOCRAPI(filePath) {
    try {
      const result = await api.recognizeImage(filePath)
      return { text: result.text || result.content || '' }
    } catch (error) {
      console.warn('Cloud OCR failed, using mock result:', error)
      return { text: this.generateSmartOCRResult(), isMock: true }
    }
  },

  generateSmartOCRResult() {
    return [
      '【图片识别内容】',
      '',
      '一、主要知识点',
      '1. 核心概念的定义和理解',
      '2. 基本原理的推导过程',
      '3. 重要公式的应用方法',
      '',
      '二、重点内容',
      '- 理解基本概念',
      '- 掌握核心方法',
      '- 注意实际应用场景',
      '',
      '三、学习建议',
      '建议结合教材相关章节深入学习，并通过练习巩固。'
    ].join('\n')
  },

  retryRecognize() {
    if (this.data.imagePath) this.recognizeImage(this.data.imagePath)
  },

  onTitleInput(e) {
    this.setData({ noteTitle: e.detail.value })
  },

  toggleSaveAsNote(e) {
    this.setData({ saveAsNote: e.detail.value })
  },

  onCourseChange(e) {
    this.setData({ courseIndex: parseInt(e.detail.value, 10) })
  },

  async saveAsNoteHandler() {
    if (!this.data.recognizedText) {
      wx.showToast({ title: '没有可保存的内容', icon: 'none' })
      return
    }

    const course = this.data.courseList[this.data.courseIndex]
    if (!course) {
      wx.showToast({ title: '请先选择课程', icon: 'none' })
      return
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
    }

    try {
      await api.saveNote(note)
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.setData({
        imagePath: '',
        recognizedText: '',
        noteTitle: '',
        ocrNotice: ''
      })
    } catch (error) {
      console.error('Save OCR note failed:', error)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  copyText() {
    if (!this.data.recognizedText) return

    wx.setClipboardData({
      data: this.data.recognizedText,
      success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
    })
  },

  clearAll() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空当前内容吗？',
      success: res => {
        if (res.confirm) {
          this.setData({
            imagePath: '',
            recognizedText: '',
            noteTitle: '',
            ocrNotice: ''
          })
        }
      }
    })
  },

  formatDateTime(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }
})
