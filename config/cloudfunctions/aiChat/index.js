const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const {
    messages,
    model = 'hunyuan-turbos-latest',
    systemPrompt = '',
    noteContext = '',
    enableRAG = false,
    noteId = null,
    stream = false
  } = event

  console.log('aiChat 收到请求:', JSON.stringify({ model, enableRAG, noteId, stream }))

  try {
    let ragContext = ''
    
    if (enableRAG && noteId) {
      ragContext = await buildRAGContext(noteId)
    } else if (noteContext) {
      ragContext = noteContext
    }

    let finalMessages = []

    if (systemPrompt || ragContext) {
      const systemContent = ragContext
        ? `${systemPrompt ? systemPrompt + '\n\n' : ''}以下是与问题相关的笔记内容，请仅基于这些内容回答，不要编造信息：\n\n${ragContext}`
        : systemPrompt
      
      if (systemContent) {
        finalMessages.push({ role: 'system', content: systemContent })
      }
    }
    
    finalMessages = finalMessages.concat(messages)

    console.log('最终消息:', JSON.stringify(finalMessages))

    if (stream) {
      return await streamChat(model, finalMessages)
    } else {
      return await chat(model, finalMessages)
    }
  } catch (err) {
    console.error('AI 调用失败:', err)
    return { success: false, error: err.message, stack: err.stack }
  }
}

async function chat(model, messages) {
  try {
    console.log('开始调用 AI 模型:', model)
    
    const res = await cloud.extend.AI.createModel("hunyuan-exp").streamText({
      data: {
        model: model,
        messages: messages
      }
    })
    
    console.log('AI 响应开始接收')
    
    let fullText = ''
    let fullThink = ''
    
    for await (let event of res.eventStream) {
      if (event.data === "[DONE]") break
      const data = JSON.parse(event.data)
      
      const think = data?.choices?.[0]?.delta?.reasoning_content
      if (think) fullThink += think
      
      const text = data?.choices?.[0]?.delta?.content
      if (text) fullText += text
    }
    
    console.log('AI 响应完成, 文本长度:', fullText.length)
    
    return {
      success: true,
      content: fullText,
      reasoning: fullThink,
      model: model
    }
  } catch (err) {
    console.error('chat 函数错误:', err)
    throw err
  }
}

async function streamChat(model, messages) {
  const res = await cloud.extend.AI.createModel("hunyuan-exp").streamText({
    data: {
      model: model,
      messages: messages
    }
  })
  
  return {
    success: true,
    stream: true,
    model: model,
    eventStream: res.eventStream
  }
}

async function buildRAGContext(noteId) {
  try {
    // 1. 获取笔记本身的内容
    const noteRes = await db.collection('notes').doc(noteId).get()
    if (!noteRes.data) return ''
    
    const note = noteRes.data
    const parts = []
    
    if (note.title) parts.push(`【笔记标题】${note.title}`)
    if (note.summary) parts.push(`【笔记摘要】${note.summary}`)
    if (note.content) parts.push(`【笔记内容】${note.content.substring(0, 1000)}`)
    if (note.tags && note.tags.length > 0) parts.push(`【标签】${note.tags.join('、')}`)
    
    // 2. 搜索知识库中的相关内容
    if (note.courseId) {
      try {
        const knowledgeRes = await db.collection('knowledge_base')
          .where({
            courseId: note.courseId
          })
          .limit(5)
          .get()
        
        if (knowledgeRes.data && knowledgeRes.data.length > 0) {
          parts.push('\n【课程知识库】')
          knowledgeRes.data.forEach((k, index) => {
            parts.push(`${index + 1}. ${k.title || '知识点'}\n${k.content.substring(0, 300)}`)
          })
        }
      } catch (e) {
        console.warn('查询知识库失败:', e)
      }
    }
    
    return parts.join('\n\n')
  } catch (err) {
    console.warn('RAG 上下文构建失败:', err)
    return ''
  }
}
