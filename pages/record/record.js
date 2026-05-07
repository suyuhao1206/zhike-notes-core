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
    selectedCourseName: '閫夋嫨璇剧▼',
    noteList: [],
    selectedNote: null,
    selectedNoteTitle: '閫夋嫨绗旇锛堝彲閫夛級',
    showNoteSelector: false,
    recordList: []
  },

  onLoad() {
    try {
      this.initRecorder();
      this.loadCourseList().catch((error) => {
        console.error('鍔犺浇璇剧▼鍒楄〃寮傚父:', error);
        this.setData({ pageError: error.message || '鍔犺浇璇剧▼澶辫触' });
      });
      this.loadRecordList();
    } catch (e) {
      console.error('褰曢煶椤靛垵濮嬪寲澶辫触:', e);
      this.setData({ pageError: e.message || '褰曢煶椤靛垵濮嬪寲澶辫触' });
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
      throw new Error('褰撳墠寰俊鐗堟湰涓嶆敮鎸佸綍闊虫帴鍙ｏ紝璇峰崌绾у井淇″悗閲嶈瘯');
    }
    const recorderManager = wx.getRecorderManager();
    
    recorderManager.onStart(() => {
      console.log('褰曢煶寮€濮?);
      this.startTimer();
    });

    recorderManager.onPause(() => {
      console.log('褰曢煶鏆傚仠');
    });

    recorderManager.onResume(() => {
      console.log('褰曢煶鎭㈠');
    });

    recorderManager.onStop((res) => {
      console.log('褰曢煶鍋滄', res);
      this.handleRecordStop(res);
    });

    recorderManager.onError((err) => {
      console.error('褰曢煶閿欒', err);
      wx.showToast({
        title: '褰曢煶澶辫触',
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
        const firstName = selectedCourse && selectedCourse.name ? selectedCourse.name : '閫夋嫨璇剧▼';
        this.setData({ courseList: courses, courseIndex, selectedCourseName: firstName });
        this.loadNotesForCourse(selectedCourse.id || selectedCourse._id);
      } else {
        this.setData({
          courseList: [],
          selectedCourseName: '璇峰厛鍒涘缓璇剧▼'
        });
      }
    } catch (error) {
      console.error('鍔犺浇璇剧▼澶辫触:', error);
      this.setData({
        courseList: [],
        selectedCourseName: '鍔犺浇澶辫触'
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
        selectedNoteTitle: notes && notes.length > 0 ? '閫夋嫨绗旇锛堝彲閫夛級' : '璇ヨ绋嬫殏鏃犵瑪璁?
      });
    } catch (error) {
      console.error('鍔犺浇绗旇澶辫触:', error);
      this.setData({ 
        noteList: [],
        selectedNote: null,
        selectedNoteTitle: '鍔犺浇绗旇澶辫触'
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
      wx.showToast({ title: '璇ヨ绋嬫殏鏃犵瑪璁?, icon: 'none' });
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
      selectedNoteTitle: '閫夋嫨绗旇锛堝彲閫夛級',
      showNoteSelector: false
    });
  },

  toggleRecord() {
    if (this.data.isRecording) {
      this.stopRecord();
    } else {
      if (this.data.courseList.length === 0) {
        wx.showModal({
          title: '鎻愮ず',
          content: '璇峰厛鍒涘缓璇剧▼',
          confirmText: '鍘诲垱寤?,
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
                title: '闇€瑕侀害鍏嬮鏉冮檺',
                content: '褰曢煶鍔熻兘闇€瑕侀害鍏嬮鏉冮檺锛岃鍦ㄨ缃腑寮€鍚悗閲嶈瘯銆?,
                confirmText: '鍘昏缃?,
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

  // 寮€濮嬪綍闊?
  startRecord() {
    if (this.data.courseList.length === 0) {
      wx.showToast({
        title: '璇峰厛閫夋嫨璇剧▼',
        icon: 'none'
      });
      return;
    }

    const { recorderManager } = this.data;
    if (!recorderManager) {
      wx.showToast({ title: '褰曢煶缁勪欢鍒濆鍖栧け璐?, icon: 'none' });
      return;
    }

    try {
      recorderManager.start({
        duration: 5400000, // 鏈€澶?90 鍒嗛挓
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3'
      });
    } catch (e) {
      console.error('寮€濮嬪綍闊冲け璐?', e);
      wx.showToast({ title: '鏃犳硶寮€濮嬪綍闊?, icon: 'none' });
      return;
    }

    this.setData({
      isRecording: true,
      recordingTime: 0,
      recordingTimeText: '00:00'
    });
  },

  // 鍋滄褰曢煶
  stopRecord() {
    const { recorderManager } = this.data;
    if (!recorderManager) return;
    try {
      recorderManager.stop();
    } catch (e) {
      console.error('鍋滄褰曢煶澶辫触:', e);
    }
  },

  // 澶勭悊褰曢煶鍋滄
  async handleRecordStop(res) {
    const { tempFilePath, duration } = res;
    const selectedCourse = (this.data.courseList.length > this.data.courseIndex && this.data.courseList[this.data.courseIndex])
      ? this.data.courseList[this.data.courseIndex]
      : {};
    const courseId = selectedCourse.id || selectedCourse._id;
    const courseName = selectedCourse.name || '鏈垎绫昏绋?;

    // 鍒涘缓璁板綍
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

    // 淇濆瓨鍒版湰鍦?
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

    // 娣诲姞鍒板垪琛ㄦ樉绀?
    this.setData({
      recordList: [{ ...record, durationText: this.formatTime(record.duration || 0) }, ...this.data.recordList]
    });

    wx.showToast({
      title: '褰曢煶宸蹭繚瀛?,
      icon: 'success'
    });

    // 寮€濮嬭浆鍐?
    this.transcribeRecord(record);
  },

  async transcribeRecord(record) {
    const api = require('../../api/api.js');
    return this.transcribeRecordWithXfyun(record, api);

    wx.showLoading({ title: '姝ｅ湪杞啓...', mask: true });

    try {
      let transcribeResult = '';
      let hasAI = false;
      
      try {
        const result = await api.transcribeAudio(record.filePath, { duration: record.duration });
        transcribeResult = result.text || result.answer || result || '';
        hasAI = true;
      } catch (apiError) {
        console.warn('AI杞啓澶辫触锛屼娇鐢ㄦ湰鍦版ā鎷?', apiError);
        transcribeResult = this.generateMockTranscription(record);
        hasAI = false;
      }

      wx.hideLoading();

      if (!transcribeResult || transcribeResult.trim().length === 0) {
        transcribeResult = this.generateMockTranscription(record);
        hasAI = false;
      }

      const course = this.data.courseList[this.data.courseIndex] || { id: 1, name: '鏈垎绫? };
      const timestamp = this.formatDateTime(new Date());
      
      const note = this.data.selectedNote ? {
        ...this.data.selectedNote,
        content: `${this.data.selectedNote.content || ''}\n\n---\n銆愬綍闊宠浆鍐欍€慭n鏃堕棿锛?{timestamp}\n鏃堕暱锛?{this.formatTime(record.duration)}\n\n${transcribeResult}`,
        content: `${this.data.selectedNote.content || ''}\n\n---\n銆愬綍闊宠浆鍐欍€慭n鏃堕棿锛?{timestamp}\n鏃堕暱锛?{this.formatTime(record.duration)}\n\n${transcribeResult}`,
        duration: (this.data.selectedNote.duration || 0) + record.duration,
        updateTime: new Date().toISOString(),
        lastRecordId: record.id,
        hasAI: hasAI
      } : {
        id: Date.now(),
        courseId: course.id || course._id,
        courseName: course.name,
        title: `${course.name} - 褰曢煶绗旇 ${timestamp.split(' ')[0]}`,
        content: `銆愬綍闊宠浆鍐欍€慭n鏃堕棿锛?{timestamp}\n鏃堕暱锛?{this.formatTime(record.duration)}\n\n${transcribeResult}`,
        content: `銆愬綍闊宠浆鍐欍€慭n鏃堕棿锛?{timestamp}\n鏃堕暱锛?{this.formatTime(record.duration)}\n\n${transcribeResult}`,
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
        ? `AI杞啓瀹屾垚锛佸叡${transcribeResult.length}瀛椼€傛槸鍚︾珛鍗虫煡鐪嬶紵`
        : `杞啓瀹屾垚锛佸叡${transcribeResult.length}瀛椼€傛槸鍚︾珛鍗虫煡鐪嬶紵\n\n鎻愮ず锛氶厤缃瓵I API鍙幏寰楁洿鍑嗙‘鐨勮浆鍐欑粨鏋溿€俙;

      wx.showModal({
        title: hasAI ? 'AI杞啓瀹屾垚' : '杞啓瀹屾垚',
        content: message,
        confirmText: '鏌ョ湅绗旇',
        cancelText: '绋嶅悗鍐嶇湅',
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
      console.error('杞啓澶辫触:', error);

      this.updateRecordStatus(record.id, 'failed');

      wx.showModal({
        title: '杞啓澶辫触',
        content: `杞啓杩囩▼涓嚭鐜伴敊璇細${error.message}\n\n鎮ㄥ彲浠ワ細\n1. 绋嶅悗閲嶈瘯\n2. 妫€鏌ョ綉缁滆繛鎺n3. 閰嶇疆AI API鑾峰緱鏇村ソ鐨勬晥鏋渀,
        showCancel: false
      });
    }
  },

  async transcribeRecordWithXfyun(record, api) {
    wx.showLoading({ title: '璁杞啓涓?..', mask: true });

    try {
      const result = await api.transcribeAudio(record.filePath, {
        duration: record.duration,
        provider: 'xfyun',
        allowCozeFallback: true
      });
      const transcribeResult = String(result.text || result.answer || '').trim();

      if (!transcribeResult) {
        throw new Error('璁鏈繑鍥炴湁鏁堣浆鍐欐枃鏈紝璇锋鏌ュ綍闊抽煶閲忔垨绋嶅悗閲嶈瘯');
      }

      wx.hideLoading();

      const course = this.data.courseList[this.data.courseIndex] || { id: 1, name: '鏈垎绫? };
      const timestamp = this.formatDateTime(new Date());
      const provider = result.provider || 'xfyun';
      const providerLabel = provider === 'coze' ? 'Coze 杞啓' : provider === 'mock' ? '妯℃嫙杞啓' : '璁璇煶璇嗗埆';
      const recordHeader = `銆愬綍闊宠浆鍐欍€慭n鏃堕棿锛?{timestamp}\n鏃堕暱锛?{this.formatTime(record.duration)}\n鏉ユ簮锛?{providerLabel}\n\n${transcribeResult}`;

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
        title: `${course.name} - 褰曢煶绗旇 ${timestamp.split(' ')[0]}`,
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

      const doneTitle = provider === 'coze' ? '杞啓瀹屾垚锛堝凡鍒囨崲 Coze锛? : provider === 'mock' ? '杞啓瀹屾垚锛堟ā鎷熺粨鏋滐級' : '杞啓瀹屾垚';
      const doneContent = provider === 'coze'
        ? `璁閴存潈澶辫触锛屽凡鑷姩鍒囨崲鍒?Coze 杞啓锛屽叡${transcribeResult.length}瀛椼€傛槸鍚︾珛鍗虫煡鐪嬶紵`
        : provider === 'mock'
          ? `璁涓嶅彲鐢紝宸茶繑鍥炴ā鎷熻浆鍐欏唴瀹广€傛槸鍚︾珛鍗虫煡鐪嬶紵`
          : `璁杞啓瀹屾垚锛屽叡${transcribeResult.length}瀛椼€傛槸鍚︾珛鍗虫煡鐪嬶紵`;

      wx.showModal({
        title: doneTitle,
        content: doneContent,
        confirmText: '鏌ョ湅绗旇',
        cancelText: '绋嶅悗鍐嶇湅',
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
      console.error('璁杞啓澶辫触:', error);
      this.updateRecordStatus(record.id, 'failed');

      wx.showModal({
        title: '杞啓澶辫触',
        content: this.getTranscribeErrorHint(error),
        showCancel: false
      });
    }
  },

  getTranscribeErrorHint(error) {
    const message = (error && error.message) || String(error || '');

    if (message.includes('XFYUN_') || message.includes('COZE_TOKEN') || message.includes('cloud env')) {
      return '云端转写环境变量还没有配置完整。\n\n请在 aiRouter 云函数环境变量中配置 XFYUN_APP_ID、XFYUN_API_KEY、XFYUN_API_SECRET；如果要启用 Coze 兜底，请同时配置 COZE_TOKEN 和 COZE_BOT_AUDIO_TRANSCRIBE。';
    }

    if (message.includes('FunctionName') || message.includes('cloud.callFunction') || message.includes('aiRouter')) {
      return '云端 AI 网关调用失败。\n\n请确认 aiRouter 云函数已经部署，并且小程序云环境 ID 配置正确。';
    }

    return `录音转写失败：${message}\n\n请检查录音音量、网络连接，以及 aiRouter 云函数日志。`;
  },

  generateMockTranscription(record) {
    const templates = [
      '浠婂ぉ鎴戜滑瀛︿範浜嗕互涓嬮噸瑕佸唴瀹癸細\n\n涓€銆佹牳蹇冩蹇礬n鏈妭璇句富瑕佽瑙ｄ簡鍩烘湰姒傚康鍜屽師鐞嗭紝闇€瑕侀噸鐐圭悊瑙ｅ叾瀹氫箟鍜屽唴娑点€俓n\n浜屻€侀噸鐐圭煡璇哱n1. 鐭ヨ瘑鐐逛竴锛氳繖鏄湰鑺傝鐨勭涓€涓噸鐐癸紝闇€瑕佺啛缁冩帉鎻°€俓n2. 鐭ヨ瘑鐐逛簩锛氳繖鏄湰鑺傝鐨勭浜屼釜閲嶇偣锛屾敞鎰忕悊瑙ｅ叾搴旂敤鍦烘櫙銆俓n3. 鐭ヨ瘑鐐逛笁锛氳繖鏄湰鑺傝鐨勭涓変釜閲嶇偣锛岄渶瑕佸弽澶嶇粌涔犮€俓n\n涓夈€侀毦鐐硅В鏋怽n鏈妭璇剧殑闅剧偣鍦ㄤ簬濡備綍灏嗙悊璁虹煡璇嗗簲鐢ㄥ埌瀹為檯闂涓紝闇€瑕佸鍔犵粌涔犮€俓n\n鍥涖€佽鍚庝綔涓歕n璇峰畬鎴愭暀鏉怭45椤电殑缁冧範棰橈紝涓嬭妭璇捐繘琛岃瑙ｃ€?,
      '璇剧▼璁板綍锛歕n\n鏈妭璇惧唴瀹规瑕侊細\n\n1. 寮€绡囧洖椤句簡涓婅妭璇剧殑閲嶇偣鍐呭\n2. 寮曞叆浜嗘柊鐨勬蹇靛拰鏂规硶\n3. 閫氳繃瀹炰緥璁茶В浜嗗叿浣撳簲鐢╘n4. 璁ㄨ浜嗗父瑙侀棶棰樺拰瑙ｅ喅鏂规\n\n鍏抽敭瑕佺偣锛歕n- 瑕佺偣涓€锛氱悊瑙ｅ熀鏈師鐞哱n- 瑕佺偣浜岋細鎺屾彙鏍稿績鏂规硶\n- 瑕佺偣涓夛細娉ㄦ剰瀹為檯搴旂敤\n\n琛ュ厖璇存槑锛歕n寤鸿璇惧悗澶氬仛缁冧範锛屽珐鍥烘墍瀛︾煡璇嗐€?,
      '璇惧爞绗旇锛歕n\n銆愯绋嬩富棰樸€慭n鏈妭璇剧殑涓婚鏄?.....\n\n銆愪富瑕佸唴瀹广€慭n1. 绗竴閮ㄥ垎锛氬熀纭€鐭ヨ瘑鐨勮瑙n2. 绗簩閮ㄥ垎锛氶噸鐐归毦鐐圭殑鍒嗘瀽\n3. 绗笁閮ㄥ垎锛氬疄渚嬫紨绀哄拰缁冧範\n\n銆愰噸瑕佺粨璁恒€慭n閫氳繃鏈妭璇剧殑瀛︿範锛屾垜浠緱鍑轰簡浠ヤ笅缁撹...\n\n銆愭€濊€冮銆慭n璇惧悗璇锋€濊€冧互涓嬮棶棰?..'
    ];
    
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    const course = this.data.courseList[this.data.courseIndex] || { name: '璇剧▼' };
    
    return `銆?{course.name}銆戝綍闊宠浆鍐橽n\n鏃堕棿锛?{this.formatDateTime(new Date())}\n鏃堕暱锛?{this.formatTime(record.duration)}\n\n${randomTemplate}`;
  },

  // 鏇存柊璁板綍鐘舵€?
  updateRecordStatus(recordId, status) {
    const records = wx.getStorageSync('records') || [];
    const index = records.findIndex(r => r.id === recordId);
    if (index > -1) {
      records[index].status = status;
      wx.setStorageSync('records', records);
    }

    // 鏇存柊椤甸潰鏄剧ず
    const recordList = this.data.recordList.map(r => {
      if (r.id === recordId) {
        return { ...r, status, statusText: this.getStatusText(status) };
      }
      return r;
    });
    this.setData({ recordList });
  },

  // 寮€濮嬭鏃?
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

  // 娣诲姞褰曢煶璁板綍
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

  // 璇剧▼閫夋嫨鍙樺寲
  onCourseChangeLegacy(e) {
    const newIndex = parseInt(e.detail.value);
    const course = this.data.courseList[newIndex];
    this.setData({
      courseIndex: newIndex,
      selectedCourseName: (course && course.name) ? course.name : '閫夋嫨璇剧▼',
      selectedNote: null,
      selectedNoteTitle: '閫夋嫨绗旇锛堝彲閫夛級'
    });
    if (course) {
      this.loadNotesForCourse(course.id || course._id);
    }
  },

  // 鏌ョ湅褰曢煶璇︽儏
  async viewRecord(e) {
    const recordId = e.currentTarget.dataset.id;
    const records = wx.getStorageSync('records') || [];
    const record = records.find(item => String(item.id) === String(recordId));

    if (!record) {
      wx.showToast({
        title: '鏈壘鍒板綍闊宠褰?,
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
      console.warn('鏌ユ壘褰曢煶鍏宠仈绗旇澶辫触:', error);
    }

    if (record.status === 'failed') {
      wx.showModal({
        title: '杞啓澶辫触',
        content: `杩欐潯褰曢煶鏆傛湭鐢熸垚绗旇銆俓n\n璇剧▼锛?{record.courseName || '鏈垎绫昏绋?}\n鏃堕暱锛?{this.formatTime(record.duration || 0)}\n鏃堕棿锛?{record.createTime || '鏈煡'}\n\n鏄惁閲嶆柊杞啓锛焋,
        confirmText: '閲嶆柊杞啓',
        cancelText: '鍏抽棴',
        success: (res) => {
          if (res.confirm) {
            this.retryTranscribeRecord(record);
          }
        }
      });
      return;
    }

    wx.showModal({
      title: '褰曢煶璁板綍',
      content: `璇剧▼锛?{record.courseName || '鏈垎绫昏绋?}\n鏃堕暱锛?{this.formatTime(record.duration || 0)}\n鏃堕棿锛?{record.createTime || '鏈煡'}\n鐘舵€侊細${this.getStatusText(record.status)}`,
      showCancel: false
    });
  },

  retryTranscribeRecord(record) {
    if (!record || !record.filePath) {
      wx.showToast({
        title: '鎵句笉鍒板師濮嬪綍闊虫枃浠?,
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
        title: '鏈壘鍒板綍闊宠褰?,
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '鍒犻櫎褰曢煶璁板綍',
      content: `灏嗗垹闄よ繖鏉″綍闊宠褰曪細\n\n璇剧▼锛?{record.courseName || '鏈垎绫昏绋?}\n鏃堕暱锛?{this.formatTime(record.duration || 0)}\n鏃堕棿锛?{record.createTime || '鏈煡'}\n\n鍏宠仈绗旇涓嶄細琚垹闄ゃ€俙,
      confirmText: '鍒犻櫎',
      confirmColor: '#ff4d4f',
      cancelText: '鍙栨秷',
      success: (res) => {
        if (!res.confirm) return;

        const records = wx.getStorageSync('records') || [];
        const nextRecords = records.filter(item => String(item.id) !== String(recordId));
        wx.setStorageSync('records', nextRecords);

        this.setData({
          recordList: this.data.recordList.filter(item => String(item.id) !== String(recordId))
        });

        wx.showToast({
          title: '宸插垹闄?,
          icon: 'success'
        });
      }
    });
  },

  // 鏍煎紡鍖栨椂闂达紙绉?-> MM:SS锛?  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  getStatusText(status) {
    if (status === 'completed') return '宸插畬鎴?;
    if (status === 'processing') return '澶勭悊涓?;
    if (status === 'failed') return '澶辫触';
    return '寰呭鐞?;
  },

  // 鏍煎紡鍖栨棩鏈熸椂闂?
  formatDateTime(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
})
