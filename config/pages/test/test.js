// 完整诊断测试页面
const api = require('../../api/api.js');
const cloudAI = require('../../api/cloudAI.js');
const DB = require('../../utils/db.js');

Page({
  data: {
    testResults: [],
    testing: false
  },

  onLoad() {
    this.runAllTests();
  },

  async runAllTests() {
    this.setData({ testing: true, testResults: [] });
    
    const tests = [
      { name: '1. 检查云开发初始化', fn: this.testCloudInit },
      { name: '2. 检查数据库初始化', fn: this.testDBInit },
      { name: '3. 获取用户 OpenID', fn: this.testGetOpenId },
      { name: '4. 测试数据库写入', fn: this.testDBWrite },
      { name: '5. 测试数据库读取', fn: this.testDBRead },
      { name: '6. 测试云函数调用', fn: this.testCloudFunction },
      { name: '7. 测试 AI 对话', fn: this.testAIChat },
      { name: '8. 测试 API 调用', fn: this.testAPICall }
    ];

    for (const test of tests) {
      const result = await this.runTest(test.name, test.fn);
      this.setData(prev => ({
        testResults: [...prev.testResults, result]
      }));
    }

    this.setData({ testing: false });
  },

  async runTest(name, testFn) {
    try {
      const result = await testFn.call(this);
      return { name, status: 'success', message: result };
    } catch (err) {
      return { name, status: 'error', message: err.message };
    }
  },

  async testCloudInit() {
    if (!wx.cloud) {
      throw new Error('wx.cloud 不存在，请检查基础库版本');
    }
    return 'wx.cloud 可用';
  },

  async testDBInit() {
    if (!DB.isCloudReady) {
      return '数据库未初始化，使用本地模式';
    }
    return '数据库已初始化: ' + (DB.db ? 'OK' : 'FAIL');
  },

  async testGetOpenId() {
    const openId = await DB._getUserId();
    if (!openId) {
      throw new Error('获取 OpenID 失败');
    }
    return 'OpenID: ' + openId.substring(0, 20) + '...';
  },

  async testDBWrite() {
    const testDoc = {
      title: '测试文档_' + Date.now(),
      content: '这是一个测试'
    };
    const result = await DB.add('notes', testDoc);
    if (!result || (!result._id && !result.id)) {
      throw new Error('写入失败，未返回 ID');
    }
    return '写入成功，ID: ' + (result._id || result.id);
  },

  async testDBRead() {
    const result = await DB.list('notes', { limit: 1 });
    if (!Array.isArray(result)) {
      throw new Error('读取失败，返回格式错误');
    }
    return '读取成功，共 ' + result.length + ' 条记录';
  },

  async testCloudFunction() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getOpenId'
      });
      
      if (res.errMsg !== 'cloud.callFunction:ok') {
        throw new Error('云函数调用失败: ' + res.errMsg);
      }
      
      return '云函数调用成功';
    } catch (err) {
      throw new Error('云函数调用失败: ' + err.message);
    }
  },

  async testAIChat() {
    try {
      console.log('开始测试 AI 对话...');
      
      const res = await wx.cloud.callFunction({
        name: 'aiChat',
        data: {
          messages: [{ role: 'user', content: '你好，请回复"测试成功"' }],
          model: 'hunyuan-turbos-latest'
        }
      });

      console.log('AI 云函数返回:', res);

      if (res.errMsg !== 'cloud.callFunction:ok') {
        throw new Error('云函数调用失败: ' + res.errMsg);
      }

      if (!res.result) {
        throw new Error('云函数返回结果为空');
      }

      if (!res.result.success) {
        throw new Error(res.result.error || 'AI 调用失败');
      }

      const text = res.result.content || '';
      return 'AI 回复: ' + text.substring(0, 50) + (text.length > 50 ? '...' : '');
    } catch (err) {
      console.error('AI 测试错误:', err);
      throw err;
    }
  },

  async testAPICall() {
    try {
      const result = await cloudAI.chat({
        messages: [{ role: 'user', content: '测试' }],
        model: 'hunyuan-turbos-latest'
      });
      
      if (!result.text) {
        throw new Error('API 返回空内容');
      }
      
      return 'API 调用成功';
    } catch (err) {
      throw new Error('API 调用失败: ' + err.message);
    }
  },

  retry() {
    this.setData({ testResults: [] });
    this.runAllTests();
  },

  showDetail(e) {
    const index = e.currentTarget.dataset.index;
    const result = this.data.testResults[index];
    
    wx.showModal({
      title: result.name,
      content: result.message,
      showCancel: false
    });
  }
});
