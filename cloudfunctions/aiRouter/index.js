const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const JSON_ONLY_PROMPT = [
  '你必须且只能输出合法 JSON。',
  '不要输出 markdown 标记，不要输出解释性文字。',
  '字符串必须正确转义，数组和对象不能有尾随逗号。'
].join('\n')

const COZE_BASE_URL = process.env.COZE_BASE_URL || 'https://api.coze.cn'
const XFYUN_BASE_URL = process.env.XFYUN_BASE_URL || 'https://office-api-ist-dx.iflyaisol.com'

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const action = event.action
  const payload = event.payload || {}
  const options = event.options || {}

  try {
    if (!action) {
      throw new Error('Missing aiRouter action')
    }

    const data = await routeAction(action, payload, options, wxContext)
    return {
      success: true,
      action,
      data
    }
  } catch (error) {
    console.error('[aiRouter] failed:', action, error)
    return {
      success: false,
      action,
      error: error.message || String(error)
    }
  }
}

async function routeAction(action, payload, options, wxContext) {
  switch (action) {
    case 'chat':
      return chat(payload, options)
    case 'askQuestion':
      return askQuestion(payload, options)
    case 'summarizeNote':
      return summarizeNote(payload, options)
    case 'generateEmergency':
      return generateEmergency(payload, options)
    case 'generateExam':
      return generateExam(payload, options, wxContext)
    case 'generateFlashcards':
      return generateFlashcards(payload, options, wxContext)
    case 'callCozeBot':
      return callCozeBot(payload, options, wxContext)
    case 'recognizeImage':
      return recognizeImage(payload, options, wxContext)
    case 'transcribeAudio':
      return transcribeAudio(payload, options, wxContext)
    default:
      throw new Error(`Unsupported aiRouter action: ${action}`)
  }
}

async function chat(payload, options) {
  const messages = normalizeMessages(payload.messages || [])
  const content = await callHunyuan(messages, {
    model: options.model || payload.model,
    temperature: options.temperature,
    maxTokens: options.maxTokens
  })

  return {
    content,
    text: content,
    model: options.model || payload.model || 'hunyuan'
  }
}

async function askQuestion(payload, options) {
  const question = String(payload.question || '').trim()
  const noteContext = String(payload.noteContext || '')

  if (!question) throw new Error('Question is required')

  const system = [
    '你是学习答疑助手。',
    '请直接回答问题，不要输出链接、URL 或外部资料推荐。',
    '回答尽量控制在 150 字以内；必要时用分点表达。',
    noteContext ? '如果提供了笔记上下文，请优先基于上下文回答；无法从上下文判断时请说明。' : ''
  ].filter(Boolean).join('\n')

  const user = noteContext
    ? `笔记上下文：\n${truncate(noteContext, 6000)}\n\n问题：${question}`
    : question

  const answer = await callHunyuan([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], {
    model: options.model,
    temperature: options.temperature || 0.3
  })

  return {
    answer: cleanLinks(answer),
    text: cleanLinks(answer),
    references: [],
    hasAI: true,
    engine: 'hunyuan'
  }
}

async function summarizeNote(payload, options) {
  const content = String(payload.content || '').trim()
  if (!content) throw new Error('Note content is required')

  return callHunyuanJson([
    {
      role: 'system',
      content: `${JSON_ONLY_PROMPT}\n你是学习笔记结构化助手。`
    },
    {
      role: 'user',
      content: [
        '请总结以下笔记，返回这个 JSON 结构：',
        '{"summary":"string","tags":["string"],"mindMap":{"title":"string","children":[{"name":"string","children":[]}]}}',
        '',
        truncate(content, 12000)
      ].join('\n')
    }
  ], options)
}

async function generateEmergency(payload, options) {
  const content = String(payload.content || '').trim()
  if (!content) throw new Error('Content is required')

  return callHunyuanJson([
    {
      role: 'system',
      content: `${JSON_ONLY_PROMPT}\n你是考前急救复习助手。`
    },
    {
      role: 'user',
      content: [
        '请把内容压缩成考前速记材料，返回这个 JSON 结构：',
        '{"title":"string","sections":[{"title":"string","content":"string"}]}',
        'sections 建议包含：核心概述、关键知识点、公式/规则、例题/思路、考前速记。',
        '',
        truncate(content, 12000)
      ].join('\n')
    }
  ], options)
}

async function generateExam(payload, options, wxContext) {
  const content = String(payload.content || '').trim()
  const config = payload.config || {}
  if (!content) throw new Error('Content is required')

  const types = Array.isArray(config.types) && config.types.length > 0
    ? config.types.join('、')
    : '选择题、填空题、简答题'
  const count = Number(config.count || config.questionCount || 8)
  const difficulty = config.difficulty || 'medium'

  const prompt = [
    `${JSON_ONLY_PROMPT}`,
    '你是专业的复习试卷生成 Agent。',
    '请基于材料生成复习试卷，返回这个 JSON 结构：',
    '{"title":"string","questions":[{"type":"选择题|填空题|简答题","content":"string","options":["A. string","B. string","C. string","D. string"],"answer":"string","explanation":"string"}]}',
    '',
    `题型：${types}`,
    `题量：${count}`,
    `难度：${difficulty}`,
    '',
    `材料：\n${truncate(content, 16000)}`
  ].join('\n')

  return callCozeJson('examGenerator', prompt, options, wxContext)
}

async function generateFlashcards(payload, options, wxContext) {
  const content = String(payload.content || '').trim()
  const count = Number(payload.count || options.count || 12)
  if (!content) throw new Error('Content is required')

  const prompt = [
    `${JSON_ONLY_PROMPT}`,
    '你是背诵卡片生成 Agent。',
    '请基于材料生成问答式卡片，返回这个 JSON 结构：',
    '{"flashcards":[{"question":"string","answer":"string"}]}',
    `卡片数量：${count}`,
    '',
    `材料：\n${truncate(content, 16000)}`
  ].join('\n')

  return callCozeJson('flashcardGen', prompt, options, wxContext)
}

async function callCozeBot(payload, options, wxContext) {
  const botType = payload.botType || options.botType || 'qaAssistant'
  const query = String(payload.query || payload.content || '').trim()
  if (!query) throw new Error('Coze query is required')

  const text = await callCozeText(botType, query, {
    contentType: payload.contentType || options.contentType || 'text',
    userId: payload.userId || wxContext.OPENID || 'wx_miniprogram_user'
  })

  return {
    text,
    answer: text,
    engine: 'coze'
  }
}

async function recognizeImage(payload, options, wxContext) {
  const fileID = payload.fileID
  if (!fileID) throw new Error('fileID is required for OCR')

  const token = process.env.COZE_TOKEN
  if (!token) throw new Error('Missing cloud env COZE_TOKEN')

  const file = await downloadCloudFile(fileID)
  const cozeFileId = await uploadCozeFile(token, file.buffer, payload.fileName || guessFileName(fileID))
  const content = JSON.stringify([
    {
      type: 'text',
      text: payload.prompt || '请识别图片中的文字、公式和题目，并整理成适合作为学习笔记保存的结构化内容。只输出识别结果和整理内容，不要输出链接。'
    },
    {
      type: 'image',
      file_id: cozeFileId
    }
  ])

  const botType = process.env.COZE_BOT_OCR_VISION ? 'ocrVision' : 'noteSummary'
  const text = await callCozeText(botType, content, {
    userId: wxContext.OPENID || 'wx_miniprogram_user',
    contentType: 'object_string'
  })

  return {
    text,
    provider: 'coze',
    engine: 'coze'
  }
}

async function callHunyuanJson(messages, options = {}) {
  let lastText = ''
  let nextMessages = messages

  for (let attempt = 0; attempt < 3; attempt++) {
    lastText = await callHunyuan(nextMessages, {
      model: options.model,
      temperature: attempt === 0 ? (options.temperature || 0.2) : 0
    })

    try {
      return JSON.parse(String(lastText || '').trim())
    } catch (error) {
      nextMessages = messages.concat([
        {
          role: 'user',
          content: `上一次输出不是合法 JSON。请修复并只输出合法 JSON，不要解释。\n\n上一次输出：\n${truncate(lastText, 4000)}`
        }
      ])
    }
  }

  throw new Error('AI returned invalid JSON after retries')
}

async function callHunyuan(messages, options = {}) {
  const normalizedMessages = normalizeMessages(messages)
  const model = options.model || 'hunyuan-turbos-latest'

  if (typeof cloud.callModel === 'function') {
    try {
      const res = await cloud.callModel({
        model: 'hunyuan',
        data: {
          model,
          messages: normalizedMessages,
          temperature: options.temperature,
          max_tokens: options.maxTokens
        }
      })
      const text = extractModelText(res)
      if (text) return text
    } catch (error) {
      console.warn('[aiRouter] cloud.callModel unavailable, fallback to extend.AI:', error.message)
    }
  }

  if (!cloud.extend || !cloud.extend.AI) {
    throw new Error('Hunyuan cloud AI is not available in this environment')
  }

  const res = await cloud.extend.AI.createModel('hunyuan-exp').streamText({
    data: {
      model,
      messages: normalizedMessages,
      temperature: options.temperature
    }
  })

  let fullText = ''
  for await (const item of res.eventStream) {
    if (item.data === '[DONE]') break
    const data = JSON.parse(item.data)
    const delta = data && data.choices && data.choices[0] && data.choices[0].delta
    if (delta && delta.content) fullText += delta.content
  }

  return fullText
}

async function callCozeJson(botType, prompt, options = {}, wxContext = {}) {
  let lastText = ''
  let nextPrompt = prompt

  for (let attempt = 0; attempt < 3; attempt++) {
    lastText = await callCozeText(botType, nextPrompt, {
      userId: wxContext.OPENID || options.userId || 'wx_miniprogram_user',
      contentType: options.contentType || 'text'
    })

    try {
      return JSON.parse(String(lastText || '').trim())
    } catch (error) {
      nextPrompt = [
        prompt,
        '',
        '上一次输出不是合法 JSON。请修复并只输出合法 JSON，不要解释。',
        `上一次输出：\n${truncate(lastText, 4000)}`
      ].join('\n')
    }
  }

  throw new Error('Coze returned invalid JSON after retries')
}

async function callCozeText(botType, content, options = {}) {
  const token = process.env.COZE_TOKEN
  const botId = getCozeBotId(botType, options)

  if (!token) throw new Error('Missing cloud env COZE_TOKEN')
  if (!botId) throw new Error(`Missing Coze bot id for ${botType}`)

  const createRes = await requestJson(`${COZE_BASE_URL}/v3/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      bot_id: botId,
      user_id: options.userId || 'wx_miniprogram_user',
      stream: false,
      auto_save_history: false,
      additional_messages: [
        {
          role: 'user',
          content,
          content_type: options.contentType || 'text'
        }
      ]
    })
  })

  if (createRes.code !== 0) {
    throw new Error(createRes.msg || createRes.message || 'Coze chat create failed')
  }

  const data = createRes.data || {}
  const directAnswer = extractCozeAnswer(data.messages)
  if (data.status === 'completed' && directAnswer) return directAnswer

  if (!data.id || !data.conversation_id) {
    const fallbackAnswer = extractCozeAnswer(data)
    if (fallbackAnswer) return fallbackAnswer
    throw new Error('Coze response missing chat id or answer')
  }

  await pollCozeUntilCompleted(token, data.id, data.conversation_id)
  return fetchCozeMessages(token, data.id, data.conversation_id)
}

async function pollCozeUntilCompleted(token, chatId, conversationId) {
  for (let index = 0; index < 60; index++) {
    await delay(1500)
    const url = `${COZE_BASE_URL}/v3/chat/retrieve?chat_id=${encodeURIComponent(chatId)}&conversation_id=${encodeURIComponent(conversationId)}`
    const res = await requestJson(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (res.code !== 0) {
      throw new Error(res.msg || 'Coze chat retrieve failed')
    }

    const status = res.data && res.data.status
    if (status === 'completed') return
    if (status && status !== 'in_progress' && status !== 'created') {
      throw new Error(`Coze chat ended with status: ${status}`)
    }
  }

  throw new Error('Coze chat timed out')
}

async function fetchCozeMessages(token, chatId, conversationId) {
  const url = `${COZE_BASE_URL}/v3/chat/message/list?chat_id=${encodeURIComponent(chatId)}&conversation_id=${encodeURIComponent(conversationId)}`
  const res = await requestJson(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })

  if (res.code !== 0) {
    throw new Error(res.msg || 'Coze message list failed')
  }

  const answer = extractCozeAnswer(res.data)
  if (!answer) throw new Error('Coze answer message not found')
  return answer
}

async function transcribeAudio(payload, options, wxContext) {
  const fileID = payload.fileID
  if (!fileID) throw new Error('fileID is required for transcription')

  const prefer = payload.provider || options.provider || 'xfyun'
  const allowCozeFallback = payload.allowCozeFallback !== false && options.allowCozeFallback !== false

  try {
    if (prefer === 'xfyun' || prefer === 'auto') {
      return await transcribeWithXfyun(fileID, payload)
    }
  } catch (error) {
    console.warn('[aiRouter] Xfyun transcription failed:', error.message)
    if (!allowCozeFallback) throw error
  }

  return transcribeWithCoze(fileID, payload, wxContext)
}

async function transcribeWithXfyun(fileID, payload) {
  const appId = process.env.XFYUN_APP_ID
  const apiKey = process.env.XFYUN_API_KEY
  const apiSecret = process.env.XFYUN_API_SECRET

  if (!appId || !apiKey || !apiSecret) {
    throw new Error('Missing XFYUN_APP_ID, XFYUN_API_KEY, or XFYUN_API_SECRET')
  }

  const file = await downloadCloudFile(fileID)
  const signatureRandom = randomString(16)
  const uploadParams = {
    appId,
    accessKeyId: apiKey,
    dateTime: formatXfyunDateTime(new Date()),
    signatureRandom,
    fileSize: String(file.buffer.length),
    fileName: payload.fileName || guessFileName(fileID),
    language: payload.language || 'autodialect',
    durationCheckDisable: 'true',
    audioMode: 'fileStream',
    eng_smoothproc: payload.smooth === false ? 'false' : 'true',
    eng_colloqproc: payload.colloq === false ? 'false' : 'true',
    pd: payload.pd || 'edu'
  }

  const uploadResult = await requestXfyun('/v2/upload', uploadParams, apiSecret, file.buffer, {
    'Content-Type': 'application/octet-stream'
  })

  if (String(uploadResult.code) !== '000000') {
    throw new Error(uploadResult.descInfo || 'Xfyun upload failed')
  }

  const orderId = uploadResult.content && uploadResult.content.orderId
  if (!orderId) throw new Error('Xfyun did not return orderId')

  const result = await pollXfyunResult(orderId, signatureRandom, { apiKey, apiSecret, estimateTime: uploadResult.content.taskEstimateTime })

  return {
    text: extractXfyunText(result),
    duration: payload.duration || 0,
    provider: 'xfyun',
    orderId
  }
}

async function transcribeWithCoze(fileID, payload, wxContext) {
  const token = process.env.COZE_TOKEN
  if (!token) throw new Error('Missing cloud env COZE_TOKEN')

  const file = await downloadCloudFile(fileID)
  const cozeFileId = await uploadCozeFile(token, file.buffer, payload.fileName || guessFileName(fileID))
  const content = JSON.stringify([
    {
      type: 'text',
      text: '请将这个音频转写为课堂笔记正文，只输出转写文本。'
    },
    {
      type: 'file',
      file_id: cozeFileId
    }
  ])

  const text = await callCozeText('audioTranscribe', content, {
    userId: wxContext.OPENID || 'wx_miniprogram_user',
    contentType: 'object_string'
  })

  return {
    text,
    duration: payload.duration || 0,
    provider: 'coze'
  }
}

async function uploadCozeFile(token, fileBuffer, fileName) {
  const boundary = `----zhike${Date.now().toString(16)}`
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${safeFileName(fileName)}"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n'
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([head, fileBuffer, tail])

  const res = await requestJson(`${COZE_BASE_URL}/v1/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    },
    body
  })

  if (res.code !== 0 && !res.id) {
    throw new Error(res.msg || 'Coze file upload failed')
  }

  const data = res.data || res
  const fileId = data.id || data.file_id
  if (!fileId) throw new Error('Coze file id missing')
  return fileId
}

async function downloadCloudFile(fileID) {
  const res = await cloud.downloadFile({ fileID })
  const buffer = res.fileContent
  if (!buffer || !buffer.length) throw new Error('Downloaded cloud file is empty')
  return { buffer }
}

async function requestXfyun(path, params, apiSecret, data, headers) {
  const signature = signXfyunRequest(apiSecret, params)
  const query = buildSignedQuery(params)

  return requestJson(`${XFYUN_BASE_URL}${path}?${query}`, {
    method: 'POST',
    headers: Object.assign({}, headers, { signature }),
    body: data
  })
}

async function pollXfyunResult(orderId, signatureRandom, config) {
  const initialDelay = Math.min(Math.max(Number(config.estimateTime || 3000), 3000), 10000)
  await delay(initialDelay)

  for (let index = 0; index < 36; index++) {
    const params = {
      accessKeyId: config.apiKey,
      dateTime: formatXfyunDateTime(new Date()),
      signatureRandom,
      orderId,
      resultType: 'transfer'
    }

    const result = await requestXfyun('/v2/getResult', params, config.apiSecret, '{}', {
      'Content-Type': 'application/json'
    })

    const code = String(result.code || '')
    if (code !== '000000' && code !== '100013') {
      throw new Error(result.descInfo || `Xfyun query failed: ${code}`)
    }

    const orderInfo = result.content && result.content.orderInfo
    const status = orderInfo && Number(orderInfo.status)
    if (status === 4 && result.content && result.content.orderResult) return result
    if (status === -1) throw new Error(`Xfyun transcription failed: ${orderInfo.failType}`)

    await delay(3000)
  }

  throw new Error('Xfyun transcription timed out')
}

function requestJson(urlString, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString)
    const body = options.body
    const req = https.request({
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 60000
    }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${truncate(text, 500)}`))
          return
        }
        try {
          resolve(text ? JSON.parse(text) : {})
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${truncate(text, 500)}`))
        }
      })
    })

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function extractModelText(res) {
  if (!res) return ''
  if (typeof res === 'string') return res
  if (res.content) return res.content
  if (res.text) return res.text
  if (res.result && typeof res.result === 'string') return res.result
  if (res.result && res.result.content) return res.result.content
  if (res.data && res.data.content) return res.data.content
  const choice = res.choices && res.choices[0]
  if (choice && choice.message && choice.message.content) return choice.message.content
  if (choice && choice.text) return choice.text
  return ''
}

function extractCozeAnswer(value) {
  const messages = Array.isArray(value)
    ? value
    : (value && Array.isArray(value.messages) ? value.messages : [])

  for (const msg of messages) {
    if (msg.role === 'assistant' || msg.type === 'answer' || msg.type === 'bot_message') {
      const content = msg.content || msg.text || ''
      if (content) return content
    }
  }

  if (value && (value.answer || value.content || value.text)) {
    return value.answer || value.content || value.text
  }

  return ''
}

function getCozeBotId(botType, options = {}) {
  if (options.botId) return options.botId

  const envMap = {
    noteSummary: 'COZE_BOT_NOTE_SUMMARY',
    qaAssistant: 'COZE_BOT_QA_ASSISTANT',
    examGenerator: 'COZE_BOT_EXAM_GENERATOR',
    flashcardGen: 'COZE_BOT_FLASHCARD_GEN',
    ocrVision: 'COZE_BOT_OCR_VISION',
    audioTranscribe: 'COZE_BOT_AUDIO_TRANSCRIBE'
  }

  return process.env[envMap[botType]] || ''
}

function normalizeMessages(messages) {
  return (messages || [])
    .filter(item => item && item.content)
    .map(item => ({
      role: item.role || 'user',
      content: String(item.content)
    }))
}

function cleanLinks(text) {
  return String(text || '')
    .replace(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi, '')
    .replace(/www\.[^\s<>"{}|\\^`[\]]+/gi, '')
    .trim()
}

function extractXfyunText(result) {
  const orderResult = result && result.content && result.content.orderResult
  if (!orderResult) return ''

  let parsed = orderResult
  if (typeof orderResult === 'string') {
    try {
      parsed = JSON.parse(orderResult)
    } catch (error) {
      return String(orderResult || '').trim()
    }
  }

  const lattice = parsed.lattice2 || parsed.lattice || []
  const segments = []

  lattice.forEach(item => {
    const jsonBest = item.json_1best || item.json_1Best
    if (!jsonBest) return

    try {
      const best = typeof jsonBest === 'string' ? JSON.parse(jsonBest) : jsonBest
      const words = (((best.st || {}).rt || [])[0] || {}).ws || []
      const text = words.map(word => (((word.cw || [])[0] || {}).w || '')).join('')
      if (text) segments.push(text)
    } catch (error) {
      console.warn('[aiRouter] skipped malformed Xfyun segment')
    }
  })

  return segments.join('').replace(/\s+/g, ' ').trim()
}

function buildSignedQuery(params) {
  return Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&')
}

function signXfyunRequest(apiSecret, params) {
  const baseString = Object.keys(params)
    .filter(key => key !== 'signature' && params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map(key => `${key}=${encodeURIComponent(String(params[key]))}`)
    .join('&')

  return crypto.createHmac('sha1', apiSecret).update(baseString).digest('base64')
}

function formatXfyunDateTime(date) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}+0800`
}

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let text = ''
  for (let index = 0; index < length; index++) {
    text += chars[Math.floor(Math.random() * chars.length)]
  }
  return text
}

function guessFileName(fileID) {
  const clean = String(fileID || '').split('?')[0]
  const name = clean.split('/').pop() || `record_${Date.now()}.mp3`
  return name.includes('.') ? name : `${name}.mp3`
}

function safeFileName(fileName) {
  return String(fileName || 'audio.mp3').replace(/[\\"]/g, '_')
}

function truncate(text, maxLength) {
  const value = String(text || '')
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
