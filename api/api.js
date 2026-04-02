/**
 * API 模块 - 封装所有 API 调用
 */

/**
 * 获取 AI 配置（支持 Coze/OpenAI/兼容 OpenAI 协议的厂商）
 */
function getAIConfig() {
  const app = getApp();
  return app.globalData.aiConfig || {
    provider: 'coze',
    providers: {
      coze: { baseUrl: 'https://api.coze.cn/v1', apiKey: '', bots: {} }
    }
  };
}

function getActiveProvider() {
  const aiConfig = getAIConfig();
  return aiConfig.provider || 'coze';
}

function getProviderConfig(provider) {
  const aiConfig = getAIConfig();
  return (aiConfig.providers && aiConfig.providers[provider]) || {};
}

// 兼容旧代码：返回 coze 配置结构
function getCozeConfig() {
  const coze = getProviderConfig('coze');
  return {
    baseUrl: coze.baseUrl || 'https://api.coze.cn/v1',
    token: coze.apiKey || '',
    bots: coze.bots || {}
  };
}

/**
 * 解析 Coze API 响应
 * @param {object} response Coze API 响应数据
 * @returns {object} 解析后的数据
 */
function parseCozeResponse(response) {
  if (!response || typeof response !== 'object') {
    return { text: String(response) };
  }

  // 处理 chat.completions 响应格式
  if (response.choices && response.choices[0]) {
    const choice = response.choices[0];
    const content = choice.message?.content || choice.text || '';

    // 尝试解析 JSON
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ||
                       content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(jsonStr.trim());
      }
    } catch (e) {
      // 不是 JSON 格式，返回原文本
    }

    return { text: content, answer: content };
  }

  // 处理文本响应
  if (typeof response === 'string') {
    try {
      return JSON.parse(response);
    } catch (e) {
      return { text: response, answer: response };
    }
  }

  return response;
}

/**
 * 调用 Coze Bot API
 * @param {string} botType Bot 类型 (noteSummary, qaAssistant, examGenerator, flashcardGen)
 * @param {string} query 用户输入
 * @param {object} options 其他参数
 */
function callCozeBot(botType, query, options = {}) {
  const provider = getActiveProvider();
  if (provider === 'coze') {
    return callCozeBotInternal(botType, query, options);
  }
  return callCompatibleLLM(query, options);
}

function callCozeBotInternal(botType, query, options = {}) {
  const config = getProviderConfig('coze');
  const botId = (config.bots || {})[botType];

  if (!config.apiKey) {
    return Promise.reject(new Error('AI API Key 未配置'));
  }

  if (!botId) {
    return Promise.reject(new Error(`Bot ${botType} ID 未配置`));
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl}/chat/completions`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      data: {
        bot_id: botId,
        user: options.userId || 'user',
        query: query,
        stream: false
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          resolve(parseCozeResponse(res.data));
        } else {
          reject(new Error((res.data && (res.data.msg || (res.data.error && res.data.error.message))) || '请求失败'));
        }
      },
      fail: reject
    });
  });
}

function callCompatibleLLM(query, options = {}) {
  const provider = getActiveProvider();
  const config = getProviderConfig(provider);

  if (!config.baseUrl || !config.apiKey || !config.model) {
    return Promise.reject(new Error('当前模型提供商配置不完整'));
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl}/chat/completions`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: config.model,
        temperature: options.temperature || 0.3,
        messages: [
          { role: 'system', content: options.systemPrompt || '你是学习助手，请输出清晰、结构化内容。' },
          { role: 'user', content: query }
        ]
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          resolve(parseCozeResponse(res.data));
        } else {
          reject(new Error((res.data && (res.data.msg || (res.data.error && res.data.error.message))) || '请求失败'));
        }
      },
      fail: reject
    });
  });
}

/**
 * 录音转写 API
 * @param {string} filePath 音频文件路径
 * @param {object} options 其他参数
 */
function transcribeAudio(filePath, options = {}) {
  const provider = getActiveProvider();
  const config = getProviderConfig(provider);

  // 语音文件上传与转写流程当前仅对 Coze 工作流开放
  if (provider !== 'coze') {
    return Promise.resolve({
      text: '当前模型提供商暂不支持音频文件直传转写，已返回示例转写文本。建议切换到 Coze 或接入专用 ASR 服务。',
      duration: options.duration || 0
    });
  }

  if (!config.apiKey) {
    // 模拟转写数据
    console.log('使用模拟数据：录音转写');
    return Promise.resolve({
      text: '这是模拟的录音转写内容。在实际配置 Coze API 后，这里将返回 AI 转写的真实文字内容。\n\n今天我们学习了以下几个重点：\n1. 概念一：定义与理解\n2. 概念二：应用与实践\n3. 概念三：总结与拓展',
      duration: 120
    });
  }

  return new Promise((resolve, reject) => {
    // 先上传文件
    wx.uploadFile({
      url: `${config.baseUrl}/files/upload`,
      filePath: filePath,
      name: 'file',
      header: {
        'Authorization': `Bearer ${config.apiKey}`
      },
      success: (uploadRes) => {
        try {
          const data = JSON.parse(uploadRes.data);
          if (data.code === 0 || data.id) {
            const fileId = data.data?.id || data.id;

            // 调用转写 Bot
            const botId = (config.bots || {}).noteSummary;
            if (!botId) {
              reject(new Error('笔记总结 Bot 未配置'));
              return;
            }

            callCozeBot('noteSummary', `请将以下音频转写为文字：file_id:${fileId}`, options)
              .then(result => {
                resolve({
                  text: result.text || result.answer || result,
                  duration: options.duration || 0
                });
              })
              .catch(reject);
          } else {
            reject(new Error(data.msg || '文件上传失败'));
          }
        } catch (e) {
          reject(new Error('解析响应失败'));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * 笔记总结 API
 * @param {string} content 笔记内容
 * @param {object} options 其他参数
 */
function summarizeNote(content, options = {}) {
  const provider = getActiveProvider();
  const config = getProviderConfig(provider);
  const botId = (config.bots || {}).noteSummary;

  if (!config.apiKey || (provider === 'coze' && !botId)) {
    // 模拟返回
    console.log('使用模拟数据：笔记总结');
    return Promise.resolve({
      summary: '这是模拟的笔记总结内容。在实际配置 Coze API 后，这里将返回 AI 生成的总结。',
      tags: ['知识点1', '知识点2', '重点'],
      mindMap: {
        title: '笔记主题',
        children: [
          { name: '要点1', children: [] },
          { name: '要点2', children: [] }
        ]
      }
    });
  }

  const query = `请总结以下笔记内容，提取关键知识点，并生成思维导图结构：

${content}

请按以下 JSON 格式返回：
{
  "summary": "总结内容",
  "tags": ["标签1", "标签2"],
  "mindMap": {
    "title": "主题",
    "children": [{"name": "要点", "children": []}]
  }
}`;

  return callCozeBot('noteSummary', query, options);
}

/**
 * AI 答疑 API
 * @param {string} question 问题
 * @param {string} noteContext 笔记上下文（可选）
 * @param {object} options 其他参数
 */
function askQuestion(question, noteContext = '', options = {}) {
  const provider = getActiveProvider();
  const config = getProviderConfig(provider);
  const botId = (config.bots || {}).qaAssistant;

  if (!config.apiKey || (provider === 'coze' && !botId)) {
    // 模拟返回
    console.log('使用模拟数据：AI答疑');
    return Promise.resolve({
      answer: '这是模拟的 AI 回答。在实际配置 Coze API 后，这里将返回基于笔记内容的智能回答。',
      references: []
    });
  }

  const query = noteContext
    ? `基于以下笔记内容回答问题：

笔记内容：
${noteContext}

问题：${question}

请提供详细且准确的回答。`
    : question;

  return callCozeBot('qaAssistant', query, options);
}

/**
 * 生成复习卷 API
 * @param {string} content 笔记内容
 * @param {object} config 配置（题型、题量、难度）
 * @param {object} options 其他参数
 */
function generateExam(content, config, options = {}) {
  const provider = getActiveProvider();
  const providerConfig = getProviderConfig(provider);
  const botId = (providerConfig.bots || {}).examGenerator;

  if (!providerConfig.apiKey || (provider === 'coze' && !botId)) {
    // 模拟返回
    console.log('使用模拟数据：复习卷生成');
    return Promise.resolve({
      title: '模拟复习卷',
      questions: [
        {
          type: '选择题',
          content: '这是模拟的选择题？',
          options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'],
          answer: 'A',
          explanation: '解释说明'
        },
        {
          type: '填空题',
          content: '这是模拟的填空题，答案是____。',
          answer: '答案',
          explanation: '解释说明'
        }
      ]
    });
  }

  const query = `请基于以下笔记内容生成复习卷：

配置要求：
- 题型：${config.types.join('、')}
- 题量：${config.count}题
- 难度：${config.difficulty === 'easy' ? '简单' : config.difficulty === 'medium' ? '中等' : '困难'}

笔记内容：
${content}

请按以下 JSON 格式返回试卷：
{
  "title": "试卷标题",
  "questions": [
    {
      "type": "题型",
      "content": "题目内容",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answer": "答案",
      "explanation": "解释说明"
    }
  ]
}`;

  return callCozeBot('examGenerator', query, options);
}

/**
 * 生成背诵卡片 API
 * @param {string} content 笔记内容
 * @param {object} options 其他参数
 */
function generateFlashcards(content, options = {}) {
  const provider = getActiveProvider();
  const config = getProviderConfig(provider);
  const botId = (config.bots || {}).flashcardGen;

  if (!config.apiKey || (provider === 'coze' && !botId)) {
    // 模拟返回
    console.log('使用模拟数据：背诵卡片');
    return Promise.resolve({
      flashcards: [
        { question: '模拟问题1？', answer: '模拟答案1' },
        { question: '模拟问题2？', answer: '模拟答案2' }
      ]
    });
  }

  const query = `请基于以下笔记内容生成背诵卡片（问答形式）：

${content}

请按以下 JSON 格式返回：
{
  "flashcards": [
    { "question": "问题", "answer": "答案" }
  ]
}`;

  return callCozeBot('flashcardGen', query, options);
}

/**
 * 生成急救模式内容
 * @param {string} content 笔记内容
 * @param {object} options 其他参数
 */
function generateEmergency(content, options = {}) {
  const provider = getActiveProvider();
  const config = getProviderConfig(provider);
  const botId = (config.bots || {}).noteSummary;

  if (!config.apiKey || (provider === 'coze' && !botId)) {
    // 模拟返回
    console.log('使用模拟数据：急救模式');
    return Promise.resolve({
      title: '急救模式 - 核心要点',
      summary: '这是模拟的急救模式内容，将笔记压缩为最核心的要点。',
      keyPoints: [
        '核心要点1',
        '核心要点2',
        '核心要点3'
      ],
      formulas: [
        { name: '公式1', content: '公式内容' }
      ]
    });
  }

  const query = `请将以下笔记内容压缩为"急救模式"（2页纸精华）：

${content}

要求：
1. 提取最核心的概念和公式
2. 保留最重要的例题和解题思路
3. 用简洁的语言表达
4. 适合考前快速复习

请按以下 JSON 格式返回：
{
  "title": "标题",
  "summary": "总体概述",
  "keyPoints": ["要点1", "要点2"],
  "formulas": [{"name": "公式名", "content": "公式内容"}]
}`;

  return callCozeBot('noteSummary', query, options);
}

/**
 * 保存课程
 * @param {object} course 课程信息
 */
function saveCourse(course) {
  return new Promise((resolve) => {
    const courses = wx.getStorageSync('courses') || [];
    course.id = course.id || Date.now();
    course.updateTime = new Date().toISOString();

    const index = courses.findIndex(c => c.id === course.id);
    if (index > -1) {
      courses[index] = course;
    } else {
      courses.push(course);
    }

    wx.setStorageSync('courses', courses);
    resolve(course);
  });
}

/**
 * 获取课程列表
 */
function getCourses() {
  return new Promise((resolve) => {
    const courses = wx.getStorageSync('courses') || [];
    resolve(courses);
  });
}

/**
 * 保存笔记
 * @param {object} note 笔记信息
 */
function saveNote(note) {
  return new Promise((resolve) => {
    const notes = wx.getStorageSync('notes') || [];
    note.id = note.id || Date.now();
    note.updateTime = new Date().toISOString();

    const index = notes.findIndex(n => n.id === note.id);
    if (index > -1) {
      notes[index] = note;
    } else {
      notes.unshift(note);
    }

    wx.setStorageSync('notes', notes);
    resolve(note);
  });
}

/**
 * 获取笔记列表
 * @param {number} courseId 课程ID（可选）
 */
function getNotes(courseId) {
  return new Promise((resolve) => {
    let notes = wx.getStorageSync('notes') || [];
    if (courseId) {
      notes = notes.filter(n => n.courseId === courseId);
    }
    resolve(notes);
  });
}

/**
 * 获取笔记详情
 * @param {number} noteId 笔记ID
 */
function getNoteById(noteId) {
  return new Promise((resolve) => {
    const notes = wx.getStorageSync('notes') || [];
    const note = notes.find(n => n.id == noteId);
    resolve(note);
  });
}

/**
 * 删除笔记
 * @param {number} noteId 笔记ID
 */
function deleteNote(noteId) {
  return new Promise((resolve) => {
    let notes = wx.getStorageSync('notes') || [];
    notes = notes.filter(n => n.id != noteId);
    wx.setStorageSync('notes', notes);
    resolve(true);
  });
}

/**
 * 保存错题
 * @param {object} mistake 错题信息
 */
function saveMistake(mistake) {
  return new Promise((resolve) => {
    const mistakes = wx.getStorageSync('mistakes') || [];
    mistake.id = mistake.id || Date.now();
    mistake.createTime = new Date().toISOString();

    mistakes.unshift(mistake);
    wx.setStorageSync('mistakes', mistakes);
    resolve(mistake);
  });
}

/**
 * 获取错题列表
 */
function getMistakes() {
  return new Promise((resolve) => {
    const mistakes = wx.getStorageSync('mistakes') || [];
    resolve(mistakes);
  });
}

/**
 * 搜索笔记
 * @param {string} query 搜索关键词
 * @param {object} options 搜索选项
 */
async function searchNotes(query, options = {}) {
  const { courseId, tag, limit = 20 } = options;

  let notes = wx.getStorageSync('notes') || [];
  const lowerQuery = query.toLowerCase();

  const filtered = notes.filter(note => {
    const matchTitle = note.title && note.title.toLowerCase().includes(lowerQuery);
    const matchContent = note.content && note.content.toLowerCase().includes(lowerQuery);
    const matchTags = note.tags && note.tags.some(t => t.toLowerCase().includes(lowerQuery));

    let matches = matchTitle || matchContent || matchTags;

    if (courseId && note.courseId !== courseId) matches = false;
    if (tag && (!note.tags || !note.tags.includes(tag))) matches = false;

    return matches;
  });

  return {
    query,
    notes: filtered.slice(0, limit)
  };
}

module.exports = {
  // AI 配置与能力
  getAIConfig,
  getCozeConfig,
  callCozeBot,
  transcribeAudio,
  summarizeNote,
  askQuestion,
  generateExam,
  generateFlashcards,
  generateEmergency,

  // 本地数据操作
  saveCourse,
  getCourses,
  saveNote,
  getNotes,
  getNoteById,
  deleteNote,
  saveMistake,
  getMistakes,

  // 搜索
  searchNotes
};
