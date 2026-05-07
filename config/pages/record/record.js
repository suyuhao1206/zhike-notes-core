Page({
  data: {
    pageError: '',
    isRecording: false,
    recordingTime: 0,
    recordingTimeText: '00:00',
    timer: null,
    recorderManager: null,
    courseList: [],
    courseIndex: 0,
    selectedCourseName: '选择课程',
    recordList: []
  },

  onLoad() {
    try {
      this.initRecorder();
      this.loadCourseList().catch((error) => {
        console.error('加载课程列表异常:', error);
        this.setData({ pageError: error.message || '加载课程失败' });
      });
      this.loadRecordList();
    } catch (e) {
      console.error('录音页初始化失败:', e);
      this.setData({ pageError: e.message || '录音页初始化失败' });
    }
  },

  onUnload() {
    // 页面卸载时停止录音
    if (this.data.isRecording) {
      this.stopRecord();
    }
    // 清除定时器
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
  },

  // 初始化录音管理器
  initRecorder() {
    if (!wx.getRecorderManager) {
      throw new Error('当前微信版本不支持录音接口，请升级微信后重试');
    }
    const recorderManager = wx.getRecorderManager();
    
    recorderManager.onStart(() => {
      console.log('录音开始');
      this.startTimer();
    });

    recorderManager.onPause(() => {
      console.log('录音暂停');
    });

    recorderManager.onResume(() => {
      console.log('录音恢复');
    });

    recorderManager.onStop((res) => {
      console.log('录音停止', res);
      this.handleRecordStop(res);
    });

    recorderManager.onError((err) => {
      console.error('录音错误', err);
      wx.showToast({
        title: '录音失败',
        icon: 'none'
      });
      this.setData({ isRecording: false });
    });

    this.setData({ recorderManager });
  },

  // 重试初始化
  retryInit() {
    this.setData({ pageError: '' });
    this.onLoad();
  },

  // 加载课程列表
  async loadCourseList() {
    try {
      const courses = wx.getStorageSync('courses') || [];

      if (courses && courses.length > 0) {
        const firstName = courses[0] && courses[0].name ? courses[0].name : '选择课程';
        this.setData({ courseList: courses, selectedCourseName: firstName });
      } else {
        // 使用默认课程
        const defaultCourses = [
          { id: 1, name: '高等数学' },
          { id: 2, name: '大学英语' },
          { id: 3, name: '计算机基础' },
          { id: 4, name: '数据结构' }
        ];
        this.setData({
          courseList: defaultCourses,
          selectedCourseName: defaultCourses[0].name
        });
      }
    } catch (error) {
      console.error('加载课程失败:', error);
      this.setData({
        courseList: [{ id: 1, name: '默认课程' }],
        selectedCourseName: '默认课程'
      });
      throw error;
    }
  },

  // 加载录音记录
  async loadRecordList() {
    const records = wx.getStorageSync('records') || [];

    // 格式化显示
    const recordList = records.map(r => ({
      ...r,
      createTime: r.createTime || this.formatDateTime(new Date(r.id)),
      durationText: this.formatTime(r.duration || 0),
      statusText: this.getStatusText(r.status)
    }));

    this.setData({ recordList });
  },

  // 切换录音状态
  toggleRecord() {
    if (this.data.isRecording) {
      this.stopRecord();
    } else {
      this.ensureRecordPermission().then((granted) => {
        if (granted) {
          this.startRecord();
        }
      });
    }
  },

  // 检查并申请录音权限
  ensureRecordPermission() {
    return new Promise((resolve) => {
      wx.getSetting({
        success: (res) => {
          const hasAuth = res.authSetting['scope.record'];
          if (hasAuth === true) {
            resolve(true);
            return;
          }

          wx.authorize({
            scope: 'scope.record',
            success: () => resolve(true),
            fail: () => {
              wx.showModal({
                title: '需要麦克风权限',
                content: '录音功能需要麦克风权限，请在设置中开启后重试。',
                confirmText: '去设置',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.openSetting({
                      success: (settingRes) => {
                        resolve(!!settingRes.authSetting['scope.record']);
                      },
                      fail: () => resolve(false)
                    });
                  } else {
                    resolve(false);
                  }
                },
                fail: () => resolve(false)
              });
            }
          });
        },
        fail: () => resolve(false)
      });
    });
  },

  // 开始录音
  startRecord() {
    if (this.data.courseList.length === 0) {
      wx.showToast({
        title: '请先选择课程',
        icon: 'none'
      });
      return;
    }

    const { recorderManager } = this.data;
    if (!recorderManager) {
      wx.showToast({ title: '录音组件初始化失败', icon: 'none' });
      return;
    }

    try {
      recorderManager.start({
        duration: 5400000, // 最大 90 分钟
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3'
      });
    } catch (e) {
      console.error('开始录音失败:', e);
      wx.showToast({ title: '无法开始录音', icon: 'none' });
      return;
    }

    this.setData({
      isRecording: true,
      recordingTime: 0,
      recordingTimeText: '00:00'
    });
  },

  // 停止录音
  stopRecord() {
    const { recorderManager } = this.data;
    if (!recorderManager) return;
    try {
      recorderManager.stop();
    } catch (e) {
      console.error('停止录音失败:', e);
    }
  },

  // 处理录音停止
  async handleRecordStop(res) {
    const { tempFilePath, duration } = res;
    const selectedCourse = (this.data.courseList.length > this.data.courseIndex && this.data.courseList[this.data.courseIndex])
      ? this.data.courseList[this.data.courseIndex]
      : {};
    const courseId = selectedCourse.id;
    const courseName = selectedCourse.name || '未分类课程';

    // 创建记录
    const record = {
      id: Date.now(),
      courseId: courseId,
      courseName: courseName,
      duration: Math.floor(duration / 1000),
      status: 'processing',
      statusText: this.getStatusText('processing'),
      createTime: this.formatDateTime(new Date()),
      filePath: tempFilePath
    };

    // 保存到本地
    const records = wx.getStorageSync('records') || [];
    records.unshift(record);
    wx.setStorageSync('records', records);

    this.setData({
      isRecording: false,
      recordingTime: 0,
      recordingTimeText: '00:00'
    });

    if (this.data.timer) {
      clearInterval(this.data.timer);
      this.setData({ timer: null });
    }

    // 添加到列表显示
    this.setData({
      recordList: [{ ...record, durationText: this.formatTime(record.duration || 0) }, ...this.data.recordList]
    });

    wx.showToast({
      title: '录音已保存',
      icon: 'success'
    });

    // 开始转写
    this.transcribeRecord(record);
  },

  // 转写录音
  async transcribeRecord(record) {
    const api = require('../../api/api.js');

    wx.showLoading({ title: '正在转写...', mask: true });

    try {
      // 调用转写API
      const result = await api.transcribeAudio(record.filePath);

      wx.hideLoading();

      // 创建笔记
      const note = {
        id: Date.now(),
        courseId: record.courseId,
        courseName: record.courseName,
        title: `${record.courseName} - ${this.formatDateTime(new Date()).split(' ')[0]}`,
        content: result.text || '转写内容',
        summary: '',
        duration: record.duration,
        createTime: new Date().toISOString()
      };

      // 保存笔记
      await api.saveNote(note);

      // 更新记录状态
      this.updateRecordStatus(record.id, 'completed');

      wx.showModal({
        title: '转写完成',
        content: '录音已转写为笔记，是否查看？',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: `/pages/note/note?id=${note.id}`
            });
          }
        }
      });

    } catch (error) {
      wx.hideLoading();
      console.error('转写失败:', error);

      // 更新记录状态为失败
      this.updateRecordStatus(record.id, 'failed');

      wx.showToast({
        title: '转写失败: ' + error.message,
        icon: 'none',
        duration: 3000
      });
    }
  },

  // 更新记录状态
  updateRecordStatus(recordId, status) {
    const records = wx.getStorageSync('records') || [];
    const index = records.findIndex(r => r.id === recordId);
    if (index > -1) {
      records[index].status = status;
      wx.setStorageSync('records', records);
    }

    // 更新页面显示
    const recordList = this.data.recordList.map(r => {
      if (r.id === recordId) {
        return { ...r, status, statusText: this.getStatusText(status) };
      }
      return r;
    });
    this.setData({ recordList });
  },

  // 开始计时
  startTimer() {
    const timer = setInterval(() => {
      const nextSeconds = this.data.recordingTime + 1;
      this.setData({
        recordingTime: nextSeconds,
        recordingTimeText: this.formatTime(nextSeconds)
      });
    }, 1000);

    this.setData({ timer });
  },

  // 添加录音记录
  addRecordToList(record) {
    const recordList = this.data.recordList;
    const newRecord = {
      id: Date.now(),
      ...record,
      createTime: this.formatDateTime(new Date())
    };
    
    recordList.unshift(newRecord);
    this.setData({ recordList });
  },

  // 课程选择变化
  onCourseChange(e) {
    const newIndex = parseInt(e.detail.value);
    const course = this.data.courseList[newIndex];
    this.setData({
      courseIndex: newIndex,
      selectedCourseName: (course && course.name) ? course.name : '选择课程'
    });
  },

  // 查看录音详情
  viewRecord(e) {
    const recordId = e.currentTarget.dataset.id;
    // TODO: 跳转到录音详情页
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 格式化时间（秒 -> MM:SS）
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  getStatusText(status) {
    if (status === 'completed') return '已完成';
    if (status === 'processing') return '处理中';
    if (status === 'failed') return '失败';
    return '待处理';
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
})
