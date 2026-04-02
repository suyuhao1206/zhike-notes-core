// pages/backup/backup.js
const util = require('../../utils/util.js');

Page({
  data: {
    isExporting: false,
    isImporting: false,
    lastBackupTime: null,
    backupSize: 0
  },

  onLoad() {
    this.loadBackupInfo();
  },

  // 加载备份信息
  loadBackupInfo() {
    const lastBackup = util.getStorage('last_backup_time');
    const backupData = util.getStorage('backup_data');
    const backupSize = backupData ? JSON.stringify(backupData).length : 0;
    
    // 计算显示文本
    let backupSizeText = '无';
    if (backupSize > 0) {
      const kb = backupSize / 1024;
      backupSizeText = kb.toFixed(2) + ' KB';
    }

    this.setData({
      lastBackupTime: lastBackup ? util.formatDateTime(lastBackup) : null,
      backupSize: backupSize,
      backupSizeText: backupSizeText
    });
  },

  // 导出数据
  async exportData() {
    this.setData({ isExporting: true });
    util.showLoading('正在导出...');

    try {
      // 收集所有数据
      const data = {
        version: '1.0',
        exportTime: new Date().toISOString(),
        courses: util.getStorage('courses', []),
        notes: util.getStorage('notes', []),
        mistakes: util.getStorage('mistakes', []),
        records: util.getStorage('records', []),
        qaHistory: this.collectQAHistory()
      };

      // 保存到本地
      util.setStorage('backup_data', data);
      util.setStorage('last_backup_time', new Date().toISOString());

      // 生成文件
      const fileName = `智课笔记备份_${util.formatDateTime(new Date(), 'YYYYMMDD_HHmmss')}.json`;

      // 复制到剪贴板
      const jsonStr = JSON.stringify(data, null, 2);
      await util.copyToClipboard(jsonStr);

      util.hideLoading();
      this.setData({ isExporting: false });
      this.loadBackupInfo();

      util.showModal('导出成功', `数据已导出并复制到剪贴板，建议保存到安全位置。\n\n文件名：${fileName}`);
    } catch (error) {
      util.hideLoading();
      this.setData({ isExporting: false });
      util.showError('导出失败');
      console.error('导出失败:', error);
    }
  },

  // 收集问答历史
  collectQAHistory() {
    const keys = wx.getStorageInfoSync().keys;
    const qaHistory = {};

    keys.forEach(key => {
      if (key.startsWith('qa_history_')) {
        qaHistory[key] = util.getStorage(key, []);
      }
    });

    return qaHistory;
  },

  // 导入数据
  async importData() {
    const confirmed = await util.confirm('导入将覆盖现有数据，确定继续吗？', '警告');
    if (!confirmed) return;

    this.setData({ isImporting: true });

    try {
      // 获取剪贴板内容
      const res = await new Promise((resolve, reject) => {
        wx.getClipboardData({
          success: resolve,
          fail: reject
        });
      });
      const jsonStr = res.data;

      if (!jsonStr) {
        util.showToast('剪贴板为空');
        this.setData({ isImporting: false });
        return;
      }

      util.showLoading('正在解析...');

      // 解析数据
      let data;
      try {
        data = JSON.parse(jsonStr);
      } catch (e) {
        util.hideLoading();
        util.showError('数据格式错误');
        this.setData({ isImporting: false });
        return;
      }

      // 验证数据格式
      if (!data.version || !data.exportTime) {
        util.hideLoading();
        util.showError('无效的数据格式');
        this.setData({ isImporting: false });
        return;
      }

      // 确认覆盖
      util.hideLoading();
      const stats = [
        `课程：${data.courses?.length || 0} 门`,
        `笔记：${data.notes?.length || 0} 条`,
        `错题：${data.mistakes?.length || 0} 条`,
        `录音：${data.records?.length || 0} 条`
      ].join('\n');

      const confirmImport = await util.confirm(`检测到以下数据：\n${stats}\n\n确定导入吗？`, '确认导入');
      if (!confirmImport) {
        this.setData({ isImporting: false });
        return;
      }

      util.showLoading('正在导入...');

      // 导入数据
      if (data.courses) util.setStorage('courses', data.courses);
      if (data.notes) util.setStorage('notes', data.notes);
      if (data.mistakes) util.setStorage('mistakes', data.mistakes);
      if (data.records) util.setStorage('records', data.records);

      // 导入问答历史
      if (data.qaHistory) {
        Object.keys(data.qaHistory).forEach(key => {
          util.setStorage(key, data.qaHistory[key]);
        });
      }

      util.hideLoading();
      this.setData({ isImporting: false });

      util.showModal('导入成功', '数据已成功导入，请重启小程序以应用更改。', () => {
        wx.reLaunch({ url: '/pages/index/index' });
      });
    } catch (error) {
      util.hideLoading();
      this.setData({ isImporting: false });
      util.showError('导入失败');
      console.error('导入失败:', error);
    }
  },

  // 清除所有数据
  async clearAllData() {
    const confirmed = await util.confirm('此操作将删除所有数据且无法恢复，确定继续吗？', '危险操作');
    if (!confirmed) return;

    const doubleConfirm = await util.confirm('请再次确认：真的要清空所有数据吗？', '最后确认');
    if (!doubleConfirm) return;

    util.showLoading('正在清除...');

    try {
      // 清除所有相关数据
      util.removeStorage('courses');
      util.removeStorage('notes');
      util.removeStorage('mistakes');
      util.removeStorage('records');
      util.removeStorage('backup_data');
      util.removeStorage('last_backup_time');
      util.removeStorage('search_history');

      // 清除问答历史
      const keys = wx.getStorageInfoSync().keys;
      keys.forEach(key => {
        if (key.startsWith('qa_history_')) {
          util.removeStorage(key);
        }
      });

      util.hideLoading();
      this.loadBackupInfo();

      util.showModal('清除完成', '所有数据已清除，小程序将重启。', () => {
        wx.reLaunch({ url: '/pages/index/index' });
      });
    } catch (error) {
      util.hideLoading();
      util.showError('清除失败');
    }
  }
});
