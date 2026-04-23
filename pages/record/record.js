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
    noteList: [],
    selectedNote: null,
    selectedNoteTitle: '选择笔记（可选）',
    showNoteSelector: false,
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
    if (this.data.isRecording) {
      this.stopRecord();
    }
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
  },

  onShow() {
    this.applyPresetCourse();
  },

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

  retryInit() {
    this.setData({ pageError: '' });
    this.onLoad();
  },

  async loadCourseList() {
    try {
      const api = require('../../api/api.js');
      const courses = await api.getCourses();

      if (courses && courses.length > 0) {
        const presetId = getApp().globalData.recordCourseId;
        const presetIndex = presetId
          ? courses.findIndex(c => String(c.id || c._id || '') === String(presetId))
          : -1;
        const courseIndex = presetIndex > -1 ? presetIndex : 0;
        const selectedCourse = courses[courseIndex];
        const firstName = selectedCourse && selectedCourse.name ? selectedCourse.name : '选择课程';
        this.setData({ courseList: courses, courseIndex, selectedCourseName: firstName });
        this.loadNotesForCourse(selectedCourse.id || selectedCourse._id);
      } else {
        this.setData({
          courseList: [],
          selectedCourseName: '请先创建课程'
        });
      }
    } catch (error) {
      console.error('加载课程失败:', error);
      this.setData({
        courseList: [],
        selectedCourseName: '加载失败'
      });
      throw error;
    }
  },

  applyPresetCourse() {
    const presetId = getApp().globalData.recordCourseId;
    if (!presetId || this.data.courseList.length === 0) return;

    const index = this.data.courseList.findIndex(c => String(c.id || c._id || '') === String(presetId));
    if (index < 0 || index === this.data.courseIndex) return;

    const course = this.data.courseList[index];
    this.setData({
      courseIndex: index,
      selectedCourseName: course.name
    });
    this.loadNotesForCourse(course.id || course._id);
  },

  async loadNotesForCourse(courseId) {
    try {
      const api = require('../../api/api.js');
      const notes = await api.getNotes(courseId);
      this.setData({ 
        noteList: notes || [],
        selectedNote: null,
        selectedNoteTitle: notes && notes.length > 0 ? '选择笔记（可选）' : '该课程暂无笔记'
      });
    } catch (error) {
      console.error('加载笔记失败:', error);
      this.setData({ 
        noteList: [],
        selectedNote: null,
        selectedNoteTitle: '加载笔记失败'
      });
    }
  },

  async loadRecordList() {
    const records = wx.getStorageSync('records') || [];
    const recordList = records.map(r => ({
      ...r,
      createTime: r.createTime || this.formatDateTime(new Date(r.id)),
      durationText: this.formatTime(r.duration || 0),
      statusText: this.getStatusText(r.status)
    }));

    this.setData({ recordList });
  },

  onCourseChange(e) {
    const index = parseInt(e.detail.value);
    const course = this.data.courseList[index];
    
    if (course) {
      this.setData({
        courseIndex: index,
        selectedCourseName: course.name
      });
      this.loadNotesForCourse(course.id || course._id);
    }
  },

  showNoteSelector() {
    if (this.data.noteList.length === 0) {
      wx.showToast({ title: '该课程暂无笔记', icon: 'none' });
      return;
    }
    this.setData({ showNoteSelector: true });
  },

  hideNoteSelector() {
    this.setData({ showNoteSelector: false });
  },

  selectNote(e) {
    const noteId = e.currentTarget.dataset.id;
    const note = this.data.noteList.find(n => String(n._id || n.id || '') === String(noteId));
    
    if (note) {
      this.setData({
        selectedNote: note,
        selectedNoteTitle: note.title,
        showNoteSelector: false
      });
    }
  },

  clearSelectedNote() {
    this.setData({
      selectedNote: null,
      selectedNoteTitle: '选择笔记（可选）',
      showNoteSelector: false
    });
  },

  toggleRecord() {
    if (this.data.isRecording) {
      this.stopRecord();
    } else {
      if (this.data.courseList.length === 0) {
        wx.showModal({
          title: '提示',
          content: '请先创建课程',
          confirmText: '去创建',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({ url: '/pages/courses/courses' });
            }
          }
        });
        return;
      }
      
      this.ensureRecordPermission().then((granted) => {
        if (granted) {
          this.startRecord();
        }
      });
    }
  },

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
    const courseId = selectedCourse.id || selectedCourse._id;
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

  async transcribeRecord(record) {
    const api = require('../../api/api.js');
    return this.transcribeRecordWithXfyun(record, api);

    wx.showLoading({ title: '正在转写...', mask: true });

    try {
      let transcribeResult = '';
      let hasAI = false;
      
      try {
        const result = await api.transcribeAudio(record.filePath, { duration: record.duration });
        transcribeResult = result.text || result.answer || result || '';
        hasAI = true;
      } catch (apiError) {
        console.warn('AI转写失败，使用本地模拟:', apiError);
        transcribeResult = this.generateMockTranscription(record);
        hasAI = false;
      }

      wx.hideLoading();

      if (!transcribeResult || transcribeResult.trim().length === 0) {
        transcribeResult = this.generateMockTranscription(record);
        hasAI = false;
      }

      const course = this.data.courseList[this.data.courseIndex] || { id: 1, name: '未分类' };
      const timestamp = this.formatDateTime(new Date());
      
      const note = this.data.selectedNote ? {
        ...this.data.selectedNote,
        content: `${this.data.selectedNote.content || ''}\n\n---\n【录音转写】\n时间：${timestamp}\n时长：${this.formatTime(record.duration)}\n\n${transcribeResult}`,
        content: `${this.data.selectedNote.content || ''}\n\n---\n【录音转写】\n时间：${timestamp}\n时长：${this.formatTime(record.duration)}\n\n${transcribeResult}`,
        duration: (this.data.selectedNote.duration || 0) + record.duration,
        updateTime: new Date().toISOString(),
        lastRecordId: record.id,
        hasAI: hasAI
      } : {
        id: Date.now(),
        courseId: course.id || course._id,
        courseName: course.name,
        title: `${course.name} - 录音笔记 ${timestamp.split(' ')[0]}`,
        content: `【录音转写】\n时间：${timestamp}\n时长：${this.formatTime(record.duration)}\n\n${transcribeResult}`,
        content: `【录音转写】\n时间：${timestamp}\n时长：${this.formatTime(record.duration)}\n\n${transcribeResult}`,
        summary: '',
        duration: record.duration,
        createTime: new Date().toISOString(),
        fromRecord: true,
        recordId: record.id,
        hasAI: hasAI
      };

      const savedNote = await api.saveNote(note);
      
      if (savedNote) {
        note.id = savedNote.id || note.id;
        note._id = savedNote._id;
      }

      this.updateRecordStatus(record.id, 'completed');

      const message = hasAI 
        ? `AI转写完成！共${transcribeResult.length}字。是否立即查看？`
        : `转写完成！共${transcribeResult.length}字。是否立即查看？\n\n提示：配置AI API可获得更准确的转写结果。`;

      wx.showModal({
        title: hasAI ? 'AI转写完成' : '转写完成',
        content: message,
        confirmText: '查看笔记',
        cancelText: '稍后再看',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: `/pages/note/note?id=${savedNote._id || savedNote.id || note._id || note.id}`
            });
          }
        }
      });

    } catch (error) {
      wx.hideLoading();
      console.error('转写失败:', error);

      this.updateRecordStatus(record.id, 'failed');

      wx.showModal({
        title: '转写失败',
        content: `转写过程中出现错误：${error.message}\n\n您可以：\n1. 稍后重试\n2. 检查网络连接\n3. 配置AI API获得更好的效果`,
        showCancel: false
      });
    }
  },

  async transcribeRecordWithXfyun(record, api) {
    wx.showLoading({ title: '讯飞转写中...', mask: true });

    try {
      const result = await api.transcribeAudio(record.filePath, {
        duration: record.duration,
        provider: 'xfyun',
        allowCozeFallback: true
      });
      const transcribeResult = String(result.text || result.answer || '').trim();

      if (!transcribeResult) {
        throw new Error('讯飞未返回有效转写文本，请检查录音音量或稍后重试');
      }

      wx.hideLoading();

      const course = this.data.courseList[this.data.courseIndex] || { id: 1, name: '未分类' };
      const timestamp = this.formatDateTime(new Date());
      const provider = result.provider || 'xfyun';
      const providerLabel = provider === 'coze' ? 'Coze 转写' : provider === 'mock' ? '模拟转写' : '讯飞语音识别';
      const recordHeader = `【录音转写】\n时间：${timestamp}\n时长：${this.formatTime(record.duration)}\n来源：${providerLabel}\n\n${transcribeResult}`;

      const note = this.data.selectedNote ? {
        ...this.data.selectedNote,
        content: `${this.data.selectedNote.content || ''}\n\n---\n${recordHeader}`,
        duration: (this.data.selectedNote.duration || 0) + record.duration,
        updateTime: new Date().toISOString(),
        lastRecordId: record.id,
        hasAI: provider !== 'mock',
        transcribeProvider: provider
      } : {
        id: Date.now(),
        courseId: course.id || course._id,
        courseName: course.name,
        title: `${course.name} - 录音笔记 ${timestamp.split(' ')[0]}`,
        content: recordHeader,
        summary: '',
        duration: record.duration,
        createTime: new Date().toISOString(),
        fromRecord: true,
        recordId: record.id,
        hasAI: provider !== 'mock',
        transcribeProvider: provider
      };

      const savedNote = await api.saveNote(note);
      if (savedNote) {
        note.id = savedNote.id || note.id;
        note._id = savedNote._id;
      }

      this.updateRecordStatus(record.id, 'completed');

      const doneTitle = provider === 'coze' ? '转写完成（已切换 Coze）' : provider === 'mock' ? '转写完成（模拟结果）' : '转写完成';
      const doneContent = provider === 'coze'
        ? `讯飞鉴权失败，已自动切换到 Coze 转写，共${transcribeResult.length}字。是否立即查看？`
        : provider === 'mock'
          ? `讯飞不可用，已返回模拟转写内容。是否立即查看？`
          : `讯飞转写完成，共${transcribeResult.length}字。是否立即查看？`;

      wx.showModal({
        title: doneTitle,
        content: doneContent,
        confirmText: '查看笔记',
        cancelText: '稍后再看',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: `/pages/note/note?id=${savedNote._id || savedNote.id || note._id || note.id}`
            });
          }
        }
      });
    } catch (error) {
      wx.hideLoading();
      console.error('讯飞转写失败:', error);
      this.updateRecordStatus(record.id, 'failed');

      wx.showModal({
        title: '转写失败',
        content: this.getTranscribeErrorHint(error),
        showCancel: false
      });
    }
  },

  getTranscribeErrorHint(error) {
    const message = (error && error.message) || String(error || '');

    if (message.includes('环境变量') || message.includes('XFYUN_') || message.includes('讯飞密钥未配置')) {
      return '讯飞密钥还没有配置完整。\n\n请到“开发配置”页面填写：\n讯飞 APPID\n讯飞 APIKey\n讯飞 APISecret\n\n保存后重新测试录音转写。';
    }

    if (message.includes('accessKeyId is not exist or forbidden') || message.includes('accessKeySecret')) {
      return '讯飞鉴权失败：当前 APIKey / APISecret 在讯飞侧无效、已停用，或没有这项服务权限。\n\n请到讯飞开放平台确认：\n1. 这组密钥是否仍然有效\n2. 是否开通了录音文件转写服务\n3. APIKey 与 APISecret 是否配对\n\n如果你愿意，我可以下一步直接帮你把默认转写改成优先走 Coze，讯飞只作为备选。';
    }

    if (message.includes('FunctionName') || message.includes('cloud.callFunction')) {
      return '当前版本的讯飞转写已经不再依赖云函数。\n\n请直接到“开发配置”页面填写讯飞 APPID、APIKey、APISecret，然后重新录音测试。';
    }

    return `讯飞转写失败：${message}\n\n请检查录音音量、网络连接，以及开发配置页里的讯飞密钥是否填写正确。`;
  },

  generateMockTranscription(record) {
    const templates = [
      '今天我们学习了以下重要内容：\n\n一、核心概念\n本节课主要讲解了基本概念和原理，需要重点理解其定义和内涵。\n\n二、重点知识\n1. 知识点一：这是本节课的第一个重点，需要熟练掌握。\n2. 知识点二：这是本节课的第二个重点，注意理解其应用场景。\n3. 知识点三：这是本节课的第三个重点，需要反复练习。\n\n三、难点解析\n本节课的难点在于如何将理论知识应用到实际问题中，需要多加练习。\n\n四、课后作业\n请完成教材P45页的练习题，下节课进行讲解。',
      '课程记录：\n\n本节课内容概要：\n\n1. 开篇回顾了上节课的重点内容\n2. 引入了新的概念和方法\n3. 通过实例讲解了具体应用\n4. 讨论了常见问题和解决方案\n\n关键要点：\n- 要点一：理解基本原理\n- 要点二：掌握核心方法\n- 要点三：注意实际应用\n\n补充说明：\n建议课后多做练习，巩固所学知识。',
      '课堂笔记：\n\n【课程主题】\n本节课的主题是......\n\n【主要内容】\n1. 第一部分：基础知识的讲解\n2. 第二部分：重点难点的分析\n3. 第三部分：实例演示和练习\n\n【重要结论】\n通过本节课的学习，我们得出了以下结论...\n\n【思考题】\n课后请思考以下问题...'
    ];
    
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    const course = this.data.courseList[this.data.courseIndex] || { name: '课程' };
    
    return `【${course.name}】录音转写\n\n时间：${this.formatDateTime(new Date())}\n时长：${this.formatTime(record.duration)}\n\n${randomTemplate}`;
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
  onCourseChangeLegacy(e) {
    const newIndex = parseInt(e.detail.value);
    const course = this.data.courseList[newIndex];
    this.setData({
      courseIndex: newIndex,
      selectedCourseName: (course && course.name) ? course.name : '选择课程',
      selectedNote: null,
      selectedNoteTitle: '选择笔记（可选）'
    });
    if (course) {
      this.loadNotesForCourse(course.id || course._id);
    }
  },

  // 查看录音详情
  async viewRecord(e) {
    const recordId = e.currentTarget.dataset.id;
    const records = wx.getStorageSync('records') || [];
    const record = records.find(item => String(item.id) === String(recordId));

    if (!record) {
      wx.showToast({
        title: '未找到录音记录',
        icon: 'none'
      });
      return;
    }

    try {
      const api = require('../../api/api.js');
      const notes = await api.getNotes();
      const matchedNote = (notes || []).find(note =>
        String(note.recordId || '') === String(record.id) ||
        String(note.lastRecordId || '') === String(record.id)
      );

      if (matchedNote) {
        wx.navigateTo({
          url: `/pages/note/note?id=${matchedNote._id || matchedNote.id}`
        });
        return;
      }
    } catch (error) {
      console.warn('查找录音关联笔记失败:', error);
    }

    if (record.status === 'failed') {
      wx.showModal({
        title: '转写失败',
        content: `这条录音暂未生成笔记。\n\n课程：${record.courseName || '未分类课程'}\n时长：${this.formatTime(record.duration || 0)}\n时间：${record.createTime || '未知'}\n\n是否重新转写？`,
        confirmText: '重新转写',
        cancelText: '关闭',
        success: (res) => {
          if (res.confirm) {
            this.retryTranscribeRecord(record);
          }
        }
      });
      return;
    }

    wx.showModal({
      title: '录音记录',
      content: `课程：${record.courseName || '未分类课程'}\n时长：${this.formatTime(record.duration || 0)}\n时间：${record.createTime || '未知'}\n状态：${this.getStatusText(record.status)}`,
      showCancel: false
    });
  },

  retryTranscribeRecord(record) {
    if (!record || !record.filePath) {
      wx.showToast({
        title: '找不到原始录音文件',
        icon: 'none'
      });
      return;
    }

    this.updateRecordStatus(record.id, 'processing');
    this.transcribeRecord(record);
  },

  deleteRecord(e) {
    const recordId = e.currentTarget.dataset.id;
    const record = this.data.recordList.find(item => String(item.id) === String(recordId));

    if (!record) {
      wx.showToast({
        title: '未找到录音记录',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '删除录音记录',
      content: `将删除这条录音记录：\n\n课程：${record.courseName || '未分类课程'}\n时长：${this.formatTime(record.duration || 0)}\n时间：${record.createTime || '未知'}\n\n关联笔记不会被删除。`,
      confirmText: '删除',
      confirmColor: '#ff4d4f',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;

        const records = wx.getStorageSync('records') || [];
        const nextRecords = records.filter(item => String(item.id) !== String(recordId));
        wx.setStorageSync('records', nextRecords);

        this.setData({
          recordList: this.data.recordList.filter(item => String(item.id) !== String(recordId))
        });

        wx.showToast({
          title: '已删除',
          icon: 'success'
        });
      }
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
