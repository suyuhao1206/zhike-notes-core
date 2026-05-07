/**
 * API 模块 - 封装所有 API 调用
 */

const DB = require('../utils/db.js');
const { hmacSha1Base64 } = require('../utils/crypto.js');

const XFYUN_BASE_URL = 'https://office-api-ist-dx.iflyaisol.com';

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

function getXfyunConfig() {
  const xfyun = getProviderConfig('xfyun');
  return {
    appId: xfyun.appId || '',
    apiKey: xfyun.apiKey || '',
    apiSecret: xfyun.apiSecret || '',
    baseUrl: xfyun.baseUrl || XFYUN_BASE_URL
  };
}

function maskSecret(value, left = 4, right = 4) {
  const text = String(value || '');
  if (!text) return '(empty)';
  if (text.length <= left + right) return `${text.slice(0, 1)}***${text.slice(-1)}`;
  return `${text.slice(0, left)}***${text.slice(-right)}`;
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

function parseJsonFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {}
    }
  }

  return null;
}

function normalizeQuestionType(type) {
  const raw = String(type || '').toLowerCase();
  if (raw.includes('choice') || raw.includes('select') || raw.includes('选择')) return '选择题';
  if (raw.includes('blank') || raw.includes('fill') || raw.includes('填空')) return '填空题';
  if (raw.includes('short') || raw.includes('简答')) return '简答题';
  return type || '选择题';
}

function cleanLooseField(value) {
  return String(value || '')
    .replace(/^[\s"'“”]+|[\s"'“”,，]+$/g, '')
    .replace(/鈫\?/g, '\n')
    .trim();
}

function parseLooseExamText(text) {
  if (!text || typeof text !== 'string') return null;

  const titleMatch = text.match(/"title"\s*:\s*"([\s\S]*?)"\s*,\s*"questions"/);
  const title = titleMatch ? cleanLooseField(titleMatch[1]) : 'AI复习卷';
  const questions = [];
  const blocks = text.split(/\{\s*"type"\s*:/).slice(1);

  blocks.forEach((part, index) => {
    const block = `"type":${part}`;
    const typeMatch = block.match(/"type"\s*:\s*"([\s\S]*?)"\s*,\s*"content"/);
    const contentMatch = block.match(/"content"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:options|answer)"/);
    const optionsMatch = block.match(/"options"\s*:\s*\[([\s\S]*?)\]\s*,\s*"answer"/);
    const answerMatch = block.match(/"answer"\s*:\s*"([\s\S]*?)"\s*,\s*"explanation"/);
    const explanationMatch = block.match(/"explanation"\s*:\s*"([\s\S]*?)(?:"\s*\}|\}\s*,|\}\s*\])/);

    if (!typeMatch || !contentMatch) return;

    const options = optionsMatch
      ? optionsMatch[1]
        .split(/",\s*"/)
        .map(item => cleanLooseField(item.replace(/^\[/, '').replace(/\]$/, '')))
        .filter(Boolean)
      : [];

    questions.push({
      id: `q_${Date.now()}_${index}`,
      type: normalizeQuestionType(cleanLooseField(typeMatch[1])),
      content: cleanLooseField(contentMatch[1]),
      options,
      answer: cleanLooseField(answerMatch ? answerMatch[1] : ''),
      explanation: cleanLooseField(explanationMatch ? explanationMatch[1] : '')
    });
  });

  return questions.length > 0 ? { title, questions } : null;
}

function normalizeExamData(result) {
  if (!result) return null;

  let exam = result.exam || result;
  if (!exam.questions) {
    const rawText = result.text || result.answer || result.content;
    const parsed = parseJsonFromText(rawText) || parseLooseExamText(rawText);
    exam = parsed ? (parsed.exam || parsed) : exam;
  }

  if (!exam || !Array.isArray(exam.questions) || exam.questions.length === 0) {
    return null;
  }

  const questions = exam.questions.map((question, index) => {
    const type = normalizeQuestionType(question.type || question.questionType);
    const rawOptions = Array.isArray(question.options) ? question.options : [];
    const options = rawOptions.map((option, optionIndex) => {
      const text = String(option || '').trim();
      if (/^[A-D][.、]/.test(text)) return text;
      return `${String.fromCharCode(65 + optionIndex)}. ${text}`;
    });

    return {
      id: question.id || `q_${Date.now()}_${index}`,
      type,
      content: question.content || question.question || question.title || '',
      options,
      answer: question.answer || question.correctAnswer || '',
      explanation: question.explanation || question.analysis || question.reason || ''
    };
  }).filter(question => question.content && (question.type !== '选择题' || question.options.length > 0));

  if (questions.length === 0) return null;

  return {
    title: exam.title || 'AI复习卷',
    questions
  };
}

function stringifyContent(value) {
  if (Array.isArray(value)) {
    return value.map(item => stringifyContent(item)).filter(Boolean).join('\n');
  }
  if (value && typeof value === 'object') {
    if (value.name || value.content) {
      return [value.name, value.content].filter(Boolean).join('：');
    }
    return Object.keys(value)
      .map(key => `${key}：${stringifyContent(value[key])}`)
      .filter(Boolean)
      .join('\n');
  }
  return String(value || '').trim();
}

function normalizeEmergencyData(result) {
  if (!result) return null;

  let data = result;
  if (typeof result === 'string') {
    data = parseJsonFromText(result) || { text: result };
  } else if (!result.sections) {
    const rawText = result.text || result.answer || result.content;
    const parsed = parseJsonFromText(rawText);
    if (parsed) data = parsed;
  }

  if (data.sections && Array.isArray(data.sections)) {
    return {
      title: data.title || '急救模式',
      sections: data.sections
        .map(section => ({
          title: section.title || section.name || '重点',
          content: stringifyContent(section.content || section.text || section.items)
        }))
        .filter(section => section.content)
    };
  }

  const sections = [];
  const pushSection = (title, content) => {
    const normalized = stringifyContent(content);
    if (normalized) sections.push({ title, content: normalized });
  };

  pushSection('核心概述', data.summary || data.overview || data.text || data.answer || data.content);
  pushSection('关键知识点', data.keyPoints || data.points || data.highlights);
  pushSection('公式/规则', data.formulas || data.rules);
  pushSection('例题/思路', data.examples || data.methods || data.steps);
  pushSection('考前速记', data.tips || data.suggestions || data.memoryTips);

  if (sections.length === 0) {
    const rawText = stringifyContent(result.text || result.answer || result.content || result);
    if (rawText) {
      sections.push({
        title: '核心内容',
        content: rawText
      });
    }
  }

  return {
    title: data.title || '急救模式 - 核心要点',
    sections
  };
}

function normalizeFlashcardList(result) {
  if (!result) return [];

  if (Array.isArray(result)) return result;

  if (Array.isArray(result.flashcards)) return result.flashcards;
  if (Array.isArray(result.cards)) return result.cards;

  const text = result.text || result.answer || result.content;
  const parsed = parseJsonFromText(text);
  if (parsed) {
    if (Array.isArray(parsed.flashcards)) return parsed.flashcards;
    if (Array.isArray(parsed.cards)) return parsed.cards;
    if (Array.isArray(parsed)) return parsed;
  }

  return [];
}

function sameId(a, b) {
  return String(a || '') === String(b || '');
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

function callCozeBotWithImage(botType, query, fileId, options = {}) {
  const provider = getActiveProvider();
  if (provider !== 'coze') {
    return callCompatibleLLM(`${query}\n\n图片文件ID：${fileId}`, options);
  }

  const content = JSON.stringify([
    {
      type: 'text',
      text: query
    },
    {
      type: 'image',
      file_id: fileId
    }
  ]);

  return callCozeBotInternal(botType, content, {
    ...options,
    contentType: 'object_string'
  });
}

function callCozeBotInternal(botType, query, options = {}) {
  const config = getProviderConfig('coze');
  const botId = (config.bots || {})[botType];

  console.log('Coze 配置:', {
    hasApiKey: !!config.apiKey,
    botType: botType,
    botId: botId
  });

  if (!config.apiKey) {
    return Promise.reject(new Error('Coze API Token 未配置'));
  }

  if (!botId) {
    return Promise.reject(new Error(`Bot ${botType} ID 未配置`));
  }

  return new Promise((resolve, reject) => {
    console.log("🚀 【V3接口】开始请求，问题:", query);
    
    wx.request({
      url: 'https://api.coze.cn/v3/chat',
      method: 'POST',
      header: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      data: {
        bot_id: botId,
        user_id: options.userId || 'wx_miniprogram_user',
        additional_messages: [
          {
            role: 'user',
            content: query,
            content_type: options.contentType || 'text'
          }
        ],
        stream: false,
        auto_save_history: true
      },
      timeout: 60000,
      success: (res) => {
        console.log("📦 【V3接口】完整响应:", JSON.stringify(res.data, null, 2));
        
        if (res.statusCode === 200 && res.data.code === 0) {
          const data = res.data.data;
          
          if (data.status === 'completed' && data.messages) {
            const aiMsg = data.messages.find(m => m.role === 'assistant');
            if (aiMsg?.content) {
              console.log("✅ 【V3接口】直接拿到回答:", aiMsg.content);
              return resolve({ text: aiMsg.content, answer: aiMsg.content });
            }
          }
          
          if (data.status === 'in_progress') {
            console.log("⏳ 【V3接口】AI生成中，启动查询...");
            return pollV3Result(config.apiKey, data.id, data.conversation_id, resolve, reject);
          }
          
          let aiAnswer = '';
          if (data.messages && Array.isArray(data.messages)) {
            for (const msg of data.messages) {
              if (
                msg.role === 'assistant' || 
                msg.type === 'answer' ||
                msg.role === 'bot' ||
                msg.type === 'bot_message'
              ) {
                aiAnswer = msg.content || msg.text || '';
                if (aiAnswer) {
                  console.log('找到 AI 回答:', aiAnswer);
                  break;
                }
              }
            }
          } else if (data.answer) {
            aiAnswer = data.answer;
          } else if (data.content) {
            aiAnswer = data.content;
          }
          
          if (aiAnswer) {
            resolve({ text: aiAnswer, answer: aiAnswer });
          } else {
            console.error('提取失败，data 结构为:', data);
            reject(new Error('AI 回答结构异常，请查看控制台日志'));
          }
        } else {
          reject(new Error(res.data?.msg || `接口返回错误，状态码：${res.statusCode}`));
        }
      },
      fail: (err) => {
        console.error('Coze API 请求失败:', err);
        reject(new Error(`网络请求失败：${err.errMsg}`));
      }
    });
  });
}

function pollV3Result(apiKey, chatId, conversationId, resolve, reject, retryCount = 0) {
  if (retryCount > 60) {
    return reject(new Error("AI响应超时，请稍后重试"));
  }

  setTimeout(() => {
    wx.request({
      url: `https://api.coze.cn/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${conversationId}`,
      method: 'GET',
      timeout: 30000,
      header: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        console.log(`🔍 【V3查询】第${retryCount + 1}次:`, JSON.stringify(res.data, null, 2));
        
        if (res.statusCode === 200 && res.data.code === 0) {
          const data = res.data.data;
          
          if (data.status === 'completed') {
            fetchV3Messages(apiKey, chatId, conversationId, resolve, reject);
          } else if (data.status === 'in_progress') {
            return pollV3Result(apiKey, chatId, conversationId, resolve, reject, retryCount + 1);
          } else {
            return reject(new Error(`查询失败，状态：${data.status}`));
          }
        } else {
          reject(new Error(res.data?.msg || "查询请求失败"));
        }
      },
      fail: (err) => reject(err)
    });
  }, 1500);
}

function fetchV3Messages(apiKey, chatId, conversationId, resolve, reject) {
  wx.request({
    url: `https://api.coze.cn/v3/chat/message/list?chat_id=${chatId}&conversation_id=${conversationId}`,
    method: 'GET',
    header: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    success: (res) => {
      console.log("📋 【V3消息列表】:", JSON.stringify(res.data, null, 2));
      
      if (res.statusCode === 200 && res.data.code === 0) {
        const messages = res.data.data;
        
        if (messages && Array.isArray(messages)) {
          for (const msg of messages) {
            if (msg.role === 'assistant' || msg.type === 'answer') {
              const content = msg.content || msg.text || '';
              if (content) {
                console.log("✅ 【V3消息】拿到回答:", content);
                return resolve({ text: content, answer: content });
              }
            }
          }
        }
        
        reject(new Error("未找到回答内容"));
      } else {
        reject(new Error(res.data?.msg || "获取消息失败"));
      }
    },
    fail: (err) => reject(err)
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
function transcribeAudioWithXfyun(filePath, options = {}) {
  const config = getXfyunConfig();
  if (!config.appId || !config.apiKey || !config.apiSecret) {
    return Promise.reject(new Error('讯飞密钥未配置，请先在设置页填写 APPID、APIKey 和 APISecret'));
  }

  return readLocalFileAsArrayBuffer(filePath).then(audioBuffer => {
    const fileName = guessAudioFileName(filePath);
    const signatureRandom = randomString(16);
    const uploadParams = {
      appId: config.appId,
      accessKeyId: config.apiKey,
      dateTime: formatXfyunDateTime(new Date()),
      signatureRandom,
      fileSize: String(audioBuffer.byteLength || audioBuffer.length || 0),
      fileName,
      language: options.language || 'autodialect',
      durationCheckDisable: 'true',
      audioMode: 'fileStream',
      eng_smoothproc: options.smooth === false ? 'false' : 'true',
      eng_colloqproc: options.colloq === false ? 'false' : 'true',
      pd: options.pd || 'edu'
    };

    console.log('🎙️ 讯飞转写请求摘要:', {
      appId: maskSecret(config.appId, 3, 2),
      apiKey: maskSecret(config.apiKey, 6, 4),
      apiSecret: maskSecret(config.apiSecret, 6, 4),
      baseUrl: config.baseUrl,
      fileName,
      fileSize: uploadParams.fileSize,
      language: uploadParams.language,
      pd: uploadParams.pd,
      dateTime: uploadParams.dateTime,
      signatureRandom
    });

    return requestXfyun('/v2/upload', uploadParams, config.apiSecret, audioBuffer, {
      'Content-Type': 'application/octet-stream'
    }, config.baseUrl).then(uploadResult => {
      if (String(uploadResult.code) !== '000000') {
        throw new Error(uploadResult.descInfo || '讯飞上传失败');
      }

      const orderId = uploadResult.content && uploadResult.content.orderId;
      if (!orderId) {
        throw new Error('讯飞未返回 orderId');
      }

      return pollXfyunResult(orderId, signatureRandom, config, uploadResult.content.taskEstimateTime).then(result => ({
        text: extractXfyunText(result),
        duration: options.duration || 0,
        provider: 'xfyun',
        orderId
      }));
    });
  });
}

function transcribeAudio(filePath, options = {}) {
  if (options.provider === 'xfyun' || options.preferXfyun !== false) {
    return transcribeAudioWithXfyun(filePath, options).catch(error => {
      console.warn('讯飞语音转写失败:', error);
      if (!options.allowCozeFallback) throw error;
      return transcribeAudioByCoze(filePath, options).catch(cozeError => {
        console.warn('Coze 语音转写失败，改用模拟转写:', cozeError);
        return Promise.resolve(createMockTranscriptionResult(options, cozeError));
      });
    });
  }

  return transcribeAudioByCoze(filePath, options).catch(error => {
    console.warn('Coze 语音转写失败，改用模拟转写:', error);
    return Promise.resolve(createMockTranscriptionResult(options, error));
  });
}

function transcribeAudioByCoze(filePath, options = {}) {
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
            const botType = (config.bots || {}).audioTranscribe ? 'audioTranscribe' : 'noteSummary';
            const botId = (config.bots || {})[botType];
            if (!botId) {
              reject(new Error('笔记总结 Bot 未配置'));
              return;
            }

            callCozeBot(botType, `请将以下音频转写为课堂笔记文字，只输出转写正文和必要的分段标题：file_id:${fileId}`, options)
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

function createMockTranscriptionResult(options = {}, sourceError) {
  if (sourceError) {
    console.warn('使用模拟录音转写结果:', sourceError);
  } else {
    console.log('使用模拟录音转写结果');
  }

  return {
    text: '这是自动生成的模拟录音转写内容。当前真实音频转写服务暂不可用，因此先为你生成一份占位课堂笔记内容。\n\n1. 本节课讲解了核心概念与基本原理。\n2. 重点内容包括定义、应用场景和常见题型。\n3. 建议课后根据课堂录音补充细节，并整理成正式笔记。',
    duration: options.duration || 0,
    provider: 'mock'
  };
}

function readLocalFileAsArrayBuffer(filePath) {
  return new Promise((resolve, reject) => {
    if (!wx.getFileSystemManager) {
      reject(new Error('当前基础库不支持读取本地录音文件'));
      return;
    }

    wx.getFileSystemManager().readFile({
      filePath,
      success: res => resolve(res.data),
      fail: err => reject(new Error(err.errMsg || '读取录音文件失败'))
    });
  });
}

function buildSignedQuery(params) {
  return Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&');
}

function signXfyunRequest(apiSecret, params) {
  const baseString = Object.keys(params)
    .filter(key => key !== 'signature' && params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map(key => `${key}=${encodeURIComponent(String(params[key]))}`)
    .join('&');
  return hmacSha1Base64(apiSecret, baseString);
}

function requestXfyun(path, params, apiSecret, data, header = {}, baseUrl = XFYUN_BASE_URL) {
  const signature = signXfyunRequest(apiSecret, params);
  const query = buildSignedQuery(params);

  console.log('🧾 讯飞签名摘要:', {
    path,
    accessKeyId: maskSecret(params.accessKeyId, 6, 4),
    appId: maskSecret(params.appId, 3, 2),
    orderId: params.orderId || '',
    dateTime: params.dateTime,
    signatureRandom: params.signatureRandom,
    signature: maskSecret(signature, 8, 6)
  });

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${path}?${query}`,
      method: 'POST',
      data,
      timeout: 60000,
      header: {
        ...header,
        signature
      },
      success: res => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
          let payload = res.data;
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
            } catch (error) {
              reject(new Error(`讯飞响应解析失败：${payload}`));
              return;
            }
          }
          resolve(payload);
          return;
        }
        reject(new Error((res.data && res.data.descInfo) || `讯飞接口请求失败：${res.statusCode}`));
      },
      fail: err => reject(new Error(err.errMsg || '讯飞接口请求失败'))
    });
  });
}

async function pollXfyunResult(orderId, signatureRandom, config, estimateTime) {
  const initialDelay = Math.min(Math.max(Number(estimateTime || 3000), 3000), 10000);
  await sleep(initialDelay);

  for (let index = 0; index < 36; index++) {
    const params = {
      accessKeyId: config.apiKey,
      dateTime: formatXfyunDateTime(new Date()),
      signatureRandom,
      orderId,
      resultType: 'transfer'
    };

    const result = await requestXfyun('/v2/getResult', params, config.apiSecret, '{}', {
      'Content-Type': 'application/json'
    }, config.baseUrl);

    if (String(result.code) !== '000000') {
      const code = String(result.code || '');
      if (code !== '100013') {
        throw new Error(result.descInfo || `讯飞查询失败：${code}`);
      }
    }

    const orderInfo = result.content && result.content.orderInfo;
    const status = orderInfo && Number(orderInfo.status);

    if (status === 4 && result.content && result.content.orderResult) {
      return result;
    }
    if (status === -1) {
      throw new Error(`讯飞转写失败，failType=${orderInfo.failType}`);
    }

    await sleep(3000);
  }

  throw new Error('讯飞转写超时，请稍后重试');
}

function extractXfyunText(result) {
  const orderResult = result && result.content && result.content.orderResult;
  if (!orderResult) return '';

  let parsed = orderResult;
  if (typeof orderResult === 'string') {
    try {
      parsed = JSON.parse(orderResult);
    } catch (error) {
      return String(orderResult || '').trim();
    }
  }

  const lattice = parsed.lattice2 || parsed.lattice || [];
  const segments = [];

  lattice.forEach(item => {
    const jsonBest = item.json_1best || item.json_1Best;
    if (!jsonBest) return;

    try {
      const best = typeof jsonBest === 'string' ? JSON.parse(jsonBest) : jsonBest;
      const words = (((best.st || {}).rt || [])[0] || {}).ws || [];
      const text = words.map(word => (((word.cw || [])[0] || {}).w || '')).join('');
      if (text) segments.push(text);
    } catch (error) {
      // Ignore malformed segment and keep extracting the rest.
    }
  });

  return segments.join('').replace(/\s+/g, ' ').trim();
}

function formatXfyunDateTime(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}+0800`;
}

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let index = 0; index < length; index++) {
    text += chars[Math.floor(Math.random() * chars.length)];
  }
  return text;
}

function guessAudioFileName(filePath) {
  const cleanPath = String(filePath || '').split('?')[0];
  const name = cleanPath.split('/').pop() || `record_${Date.now()}.mp3`;
  return name.includes('.') ? name : `${name}.mp3`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  return callCozeBot('noteSummary', query, options).then(result => {
    console.log('summarizeNote 原始返回:', result);
    
    if (result && result.text && typeof result.text === 'string') {
      try {
        const parsed = JSON.parse(result.text);
        console.log('解析后的数据:', parsed);
        return parsed;
      } catch (e) {
        console.log('JSON解析失败，尝试提取JSON');
        try {
          const jsonMatch = result.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            console.log('提取并解析后的数据:', parsed);
            return parsed;
          }
        } catch (e2) {
          console.error('JSON提取失败:', e2);
        }
      }
    }
    
    return result;
  });
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
    console.log('使用模拟数据：AI答疑');
    const mockAnswer = generateSmartMockAnswer(question, noteContext);
    return Promise.resolve({
      answer: mockAnswer,
      references: [],
      hasAI: false
    });
  }

  const systemPrompt = `你是学习助手，回答问题需遵守：
1. 回答控制在150字以内，简洁明了
2. 禁止输出任何链接、URL、网址
3. 禁止推荐外部资源或参考资料
4. 直接给出答案，不要开场白和结束语
5. 重点内容用分点或序号呈现`;

  const query = noteContext
    ? `笔记内容：
${noteContext.substring(0, 500)}

问题：${question}

请简短回答，禁止输出链接。`
    : `${question}\n\n请简短回答，控制在150字内，禁止输出任何链接。`;

  return callCozeBot('qaAssistant', query, { ...options, systemPrompt }).then(result => ({
    answer: cleanAnswer(result.text || result.answer || result),
    references: [],
    hasAI: true
  }));
}

function cleanAnswer(text) {
  if (!text) return text;
  
  let cleaned = text
    .replace(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi, '[链接已移除]')
    .replace(/www\.[^\s<>"{}|\\^`\[\]]+/gi, '[链接已移除]')
    .replace(/参考.*?:\s*/gi, '')
    .replace(/参考资料.*?\n/gi, '')
    .replace(/推荐阅读.*?\n/gi, '')
    .replace(/相关链接.*?\n/gi, '');
  
  return cleaned.trim();
}

function generateSmartMockAnswer(question, context) {
  const questionLower = question.toLowerCase();
  
  if (context && context.length > 50) {
    const keywords = extractKeywords(question);
    const relevantParts = findRelevantContext(context, keywords);
    
    if (relevantParts.length > 0) {
      return `相关内容：\n${relevantParts.slice(0, 2).join('\n')}`;
    }
  }
  
  if (questionLower.includes('什么是') || questionLower.includes('定义')) {
    return `概念要点：\n1. 核心定义\n2. 关键特征\n3. 应用场景`;
  }
  
  if (questionLower.includes('怎么') || questionLower.includes('如何')) {
    return `解决步骤：\n1. 明确要求\n2. 选择方法\n3. 逐步实施`;
  }
  
  if (questionLower.includes('为什么') || questionLower.includes('原因')) {
    return `主要原因：\n1. 核心原理\n2. 关键因素`;
  }
  
  return `建议：\n1. 查阅笔记相关内容\n2. 理解核心概念`;
}

function extractKeywords(text) {
  const stopWords = ['的', '是', '在', '了', '和', '与', '或', '等', '这', '那', '有', '为', '对', '把', '被', '让', '给', '向', '从', '到', '中', '上', '下', '不', '都', '很', '也', '就', '着', '过', '会', '能', '要', '想', '什么', '怎么', '如何', '为什么', '哪', '谁', '多少'];
  const words = text.split(/[\s，。！？、；：""''（）【】《》]+/);
  return words.filter(word => word.length > 1 && !stopWords.includes(word));
}

function findRelevantContext(context, keywords) {
  const sentences = context.split(/[。\n]/);
  const relevant = [];
  
  for (const sentence of sentences) {
    if (sentence.trim().length < 10) continue;
    
    const matchCount = keywords.filter(kw => sentence.includes(kw)).length;
    if (matchCount > 0) {
      relevant.push(sentence.trim());
    }
  }
  
  return relevant.slice(0, 3);
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

  return callCozeBot('examGenerator', query, options).then(result => {
    const exam = normalizeExamData(result);
    if (!exam) {
      console.warn('复习卷解析失败，原始返回:', result);
      return result;
    }
    return exam;
  });
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

  return callCozeBot('flashcardGen', query, options).then(result => ({
    ...result,
    flashcards: normalizeFlashcardList(result)
  }));
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
    return Promise.resolve(normalizeEmergencyData({
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
    }));
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

  return callCozeBot('noteSummary', query, options).then(result => {
    const emergency = normalizeEmergencyData(result);
    if (!emergency || emergency.sections.length === 0) {
      console.warn('急救模式解析失败，原始返回:', result);
      return result;
    }
    return emergency;
  });
}

/**
 * 保存课程
 * @param {object} course 课程信息
 */
async function saveCourse(course) {
  const data = { ...course };
  delete data._openid;
  delete data._createTime;
  delete data._updateTime;
  
  if (!data.id && !data._id) {
    data.id = `course_${Date.now()}`;
  }
  if (course.id && !course._id) {
    data.id = course.id;
  }
  if (course._id) {
    return await DB.update('courses', course._id, data);
  }
  return await DB.add('courses', data);
}

/**
 * 获取课程列表
 */
async function getCourses() {
  return await DB.list('courses', { limit: 100 });
}

async function deleteCourse(courseId) {
  return await DB.remove('courses', courseId);
}

/**
 * 保存笔记
 * @param {object} note 笔记信息
 */
async function saveNote(note) {
  const data = { ...note };
  delete data._openid;
  delete data._createTime;
  delete data._updateTime;
  
  if (note.id && !note._id) {
    data.id = note.id;
  }
  if (note._id) {
    return await DB.update('notes', note._id, data);
  }
  return await DB.add('notes', data);
}

/**
 * 获取笔记列表
 * @param {number} courseId 课程ID（可选）
 */
async function getNotes(courseId) {
  const notes = await DB.list('notes', { limit: 500 });
  if (!courseId) return notes;

  const courseIds = new Set([String(courseId)]);
  try {
    const courses = await getCourses();
    const matchedCourse = courses.find(course => sameId(course.id, courseId) || sameId(course._id, courseId));
    if (matchedCourse) {
      if (matchedCourse.id) courseIds.add(String(matchedCourse.id));
      if (matchedCourse._id) courseIds.add(String(matchedCourse._id));
    }
  } catch (error) {
    console.warn('匹配课程ID失败，使用原始courseId筛选:', error);
  }

  return notes.filter(note => courseIds.has(String(note.courseId || '')));
}

/**
 * 获取笔记详情
 * @param {number} noteId 笔记ID
 */
async function getNoteById(noteId) {
  return await DB.get('notes', noteId);
}

/**
 * 删除笔记
 * @param {number} noteId 笔记ID
 */
async function deleteNote(noteId) {
  return await DB.remove('notes', noteId);
}

/**
 * 保存错题
 * @param {object} mistake 错题信息
 */
async function saveMistake(mistake) {
  const data = { ...mistake };
  if (mistake.id && !mistake._id) {
    data.id = mistake.id;
  }
  return await DB.add('mistakes', data);
}

/**
 * 获取错题列表
 */
async function getMistakes() {
  return await DB.list('mistakes', { limit: 100 });
}

async function updateMistake(mistakeId, data) {
  return await DB.update('mistakes', mistakeId, data);
}

async function deleteMistake(mistakeId) {
  return await DB.remove('mistakes', mistakeId);
}

/**
 * 搜索笔记
 * @param {string} query 搜索关键词
 * @param {object} options 搜索选项
 */
async function searchNotes(query, options = {}) {
  const { courseId, tag, limit = 20 } = options;

  let notes = await DB.list('notes', { limit: 100 });
  const lowerQuery = query.toLowerCase();
  const courseIds = new Set(courseId ? [String(courseId)] : []);

  if (courseId) {
    try {
      const courses = await getCourses();
      const matchedCourse = courses.find(course => sameId(course.id, courseId) || sameId(course._id, courseId));
      if (matchedCourse) {
        if (matchedCourse.id) courseIds.add(String(matchedCourse.id));
        if (matchedCourse._id) courseIds.add(String(matchedCourse._id));
      }
    } catch (error) {
      console.warn('搜索时匹配课程ID失败，使用原始courseId:', error);
    }
  }

  const filtered = notes.filter(note => {
    const matchTitle = note.title && note.title.toLowerCase().includes(lowerQuery);
    const matchContent = note.content && note.content.toLowerCase().includes(lowerQuery);
    const matchTags = note.tags && note.tags.some(t => t.toLowerCase().includes(lowerQuery));

    let matches = matchTitle || matchContent || matchTags;

    if (courseId && !courseIds.has(String(note.courseId || ''))) matches = false;
    if (tag && (!note.tags || !note.tags.includes(tag))) matches = false;

    return matches;
  });

  return {
    query,
    notes: filtered.slice(0, limit)
  };
}

async function saveFlashcard(flashcard) {
  const data = { ...flashcard };
  delete data._openid;
  delete data._createTime;
  delete data._updateTime;
  
  if (flashcard.id && !flashcard._id) {
    data.id = flashcard.id;
  }
  if (flashcard._id) {
    try {
      return await DB.update('flashcards', flashcard._id, data);
    } catch (error) {
      console.warn('云端更新卡片失败，已保留本地缓存:', error);
      wx.setStorageSync('flashcards', upsertLocalFlashcard(data));
      return data;
    }
  }
  try {
    return await DB.add('flashcards', data);
  } catch (error) {
    console.warn('云端保存卡片失败，已保留本地缓存:', error);
    wx.setStorageSync('flashcards', upsertLocalFlashcard(data));
    return data;
  }
}

function upsertLocalFlashcard(card) {
  const cards = wx.getStorageSync('flashcards') || [];
  const cardId = card._id || card.id;
  const index = cards.findIndex(item => String(item._id || item.id || '') === String(cardId || ''));
  if (index > -1) {
    cards[index] = { ...cards[index], ...card };
  } else {
    cards.unshift(card);
  }
  return cards;
}

async function saveFlashcards(cards, meta = {}) {
  const savedCards = [];
  const now = new Date().toISOString();

  for (let index = 0; index < (cards || []).length; index++) {
    const card = cards[index] || {};
    const normalized = {
      id: card.id || `${meta.noteId || meta.courseId || 'card'}_${Date.now()}_${index}`,
      question: card.question || card.front || card.title || '',
      answer: card.answer || card.back || card.content || '',
      status: card.status || 'new',
      noteId: card.noteId || meta.noteId || '',
      courseId: card.courseId || meta.courseId || '',
      courseName: card.courseName || meta.courseName || '',
      noteTitle: card.noteTitle || meta.noteTitle || '',
      createTime: card.createTime || now,
      updateTime: now
    };

    if (!normalized.question && !normalized.answer) continue;
    savedCards.push(await saveFlashcard(normalized));
  }

  return savedCards;
}

async function getFlashcards(noteId) {
  let allCards = [];
  try {
    allCards = await DB.list('flashcards', { limit: 500 });
  } catch (error) {
    console.warn('云端读取卡片失败，改用本地缓存:', error);
    allCards = wx.getStorageSync('flashcards') || [];
  }

  if (noteId) {
    return allCards.filter(card => 
      String(card.noteId) === String(noteId) || card.noteId === noteId
    );
  }
  return allCards;
}

async function getFlashcardsByCourse(courseId) {
  const allCards = await getFlashcards();
  const courseIds = new Set([String(courseId || '')]);
  try {
    const courses = await getCourses();
    const matchedCourse = courses.find(course => sameId(course.id, courseId) || sameId(course._id, courseId));
    if (matchedCourse) {
      if (matchedCourse.id) courseIds.add(String(matchedCourse.id));
      if (matchedCourse._id) courseIds.add(String(matchedCourse._id));
    }
  } catch (error) {
    console.warn('匹配卡片课程ID失败，使用原始courseId筛选:', error);
  }
  return allCards.filter(card => courseIds.has(String(card.courseId || '')));
}

async function deleteFlashcard(flashcardId) {
  return await DB.remove('flashcards', flashcardId);
}

module.exports = {
  getAIConfig,
  getCozeConfig,
  callCozeBot,
  callCozeBotWithImage,
  transcribeAudio,
  summarizeNote,
  askQuestion,
  generateExam,
  generateFlashcards,
  generateEmergency,

  saveCourse,
  getCourses,
  deleteCourse,
  saveNote,
  getNotes,
  getNoteById,
  deleteNote,
  saveMistake,
  getMistakes,
  updateMistake,
  deleteMistake,

  searchNotes,
  
  saveFlashcard,
  saveFlashcards,
  getFlashcards,
  getFlashcardsByCourse,
  deleteFlashcard
};
