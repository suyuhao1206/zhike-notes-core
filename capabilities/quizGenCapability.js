/**
 * 测验生成能力 (Quiz Generation Capability)
 * 根据笔记内容自动生成测验题
 */

const BaseCapability = require('./baseCapability')
const aiService = require('../services/aiService')

class QuizGenCapability extends BaseCapability {
  getManifest() {
    return {
      name: 'quiz_generation',
      description: '根据笔记内容自动生成测验题，支持选择题、填空题、简答题',
      stages: ['analysis', 'generation', 'validation'],
      toolsUsed: ['rag'],
      cliAliases: ['quiz', 'q'],
      configDefaults: {
        numQuestions: 5,
        difficulty: 'medium',
        questionTypes: ['choice', 'fill', 'short']
      }
    }
  }

  async run(context, eventBus) {
    try {
      this.emitStage(eventBus, 'analysis', '分析笔记内容...')
      
      const topics = await this.analyzeTopics(context)
      this.emitContent(eventBus, `识别到 ${topics.length} 个知识点`)
      
      this.emitStage(eventBus, 'generation', '生成测验题...')
      
      const quizzes = await this.generateQuizzes(context, topics, eventBus)
      
      this.emitStage(eventBus, 'validation', '验证题目质量...')
      
      const validated = await this.validateQuizzes(quizzes)
      
      const result = this.formatQuizResult(validated)
      
      return {
        success: true,
        content: result,
        metadata: {
          totalQuestions: validated.length,
          topics: topics.map(t => t.name)
        }
      }
    } catch (error) {
      this.emitError(eventBus, error)
      throw error
    }
  }

  async analyzeTopics(context) {
    const { notebookContext, userMessage } = context
    
    const systemPrompt = `你是一个知识分析专家。请从给定的笔记内容中提取主要知识点。

请按以下JSON格式输出知识点列表：
[
  {
    "name": "知识点名称",
    "importance": "high/medium/low",
    "keywords": ["关键词1", "关键词2"]
  }
]

要求：
1. 提取3-8个核心知识点
2. 标注重要性（考试频率）
3. 列出相关关键词`

    const userPrompt = notebookContext
      ? `笔记内容：\n${notebookContext}\n\n请提取知识点。`
      : `主题：${userMessage}\n\n请生成相关知识点。`

    const response = await aiService.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3
    })

    try {
      const topics = JSON.parse(response.content)
      return topics
    } catch (error) {
      console.error('Failed to parse topics:', error)
      return [
        { name: '核心概念', importance: 'high', keywords: [] }
      ]
    }
  }

  async generateQuizzes(context, topics, eventBus) {
    const config = {
      ...this.getManifest().configDefaults,
      ...context.configOverrides
    }
    
    const { numQuestions, difficulty, questionTypes } = config
    
    const quizzes = []
    const questionsPerType = Math.ceil(numQuestions / questionTypes.length)
    
    for (const type of questionTypes) {
      this.emitProgress(eventBus, quizzes.length / numQuestions, `生成${this.getTypeName(type)}...`)
      
      const typeQuizzes = await this.generateQuestionsByType(
        context,
        topics,
        type,
        questionsPerType,
        difficulty
      )
      
      quizzes.push(...typeQuizzes)
      
      if (quizzes.length >= numQuestions) break
    }
    
    return quizzes.slice(0, numQuestions)
  }

  async generateQuestionsByType(context, topics, type, count, difficulty) {
    const systemPrompt = this.getTypeSystemPrompt(type, difficulty)
    
    const selectedTopics = topics.slice(0, Math.min(3, topics.length))
    const topicsText = selectedTopics.map(t => `- ${t.name}`).join('\n')
    
    const userPrompt = `知识点：
${topicsText}

笔记内容：
${context.notebookContext || '无'}

请生成 ${count} 道${this.getTypeName(type)}。`

    const response = await aiService.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7
    })

    return this.parseQuizzes(response.content, type)
  }

  getTypeSystemPrompt(type, difficulty) {
    const basePrompt = `你是一个专业的出题专家。请根据给定的知识点和笔记内容，生成高质量的测验题。

难度设置：${difficulty}

要求：
1. 题目准确、无歧义
2. 答案明确、有依据
3. 难度适中，符合学生水平
4. 覆盖核心知识点`

    const typePrompts = {
      choice: `${basePrompt}

请按以下JSON格式输出选择题：
[
  {
    "type": "choice",
    "question": "题目内容",
    "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
    "answer": "A",
    "explanation": "解析说明",
    "difficulty": "${difficulty}",
    "topic": "相关知识点"
  }
]`,

      fill: `${basePrompt}

请按以下JSON格式输出填空题：
[
  {
    "type": "fill",
    "question": "题目内容，用___表示空格",
    "answer": "答案",
    "explanation": "解析说明",
    "difficulty": "${difficulty}",
    "topic": "相关知识点"
  }
]`,

      short: `${basePrompt}

请按以下JSON格式输出简答题：
[
  {
    "type": "short",
    "question": "题目内容",
    "answer": "参考答案",
    "keywords": ["关键词1", "关键词2"],
    "explanation": "评分要点",
    "difficulty": "${difficulty}",
    "topic": "相关知识点"
  }
]`
    }

    return typePrompts[type] || typePrompts.choice
  }

  parseQuizzes(content, type) {
    try {
      const quizzes = JSON.parse(content)
      return quizzes.map(q => ({
        ...q,
        type,
        id: this.generateId()
      }))
    } catch (error) {
      console.error('Failed to parse quizzes:', error)
      return []
    }
  }

  async validateQuizzes(quizzes) {
    const validQuizzes = []
    
    for (const quiz of quizzes) {
      if (this.isValidQuiz(quiz)) {
        validQuizzes.push(quiz)
      }
    }
    
    return validQuizzes
  }

  isValidQuiz(quiz) {
    if (!quiz.question || !quiz.answer) return false
    
    if (quiz.type === 'choice') {
      if (!quiz.options || quiz.options.length < 2) return false
    }
    
    return true
  }

  formatQuizResult(quizzes) {
    let result = `📝 测验卷\n共 ${quizzes.length} 题\n\n`
    
    quizzes.forEach((quiz, index) => {
      result += `【第${index + 1}题】${this.getTypeName(quiz.type)}\n`
      result += `${quiz.question}\n`
      
      if (quiz.type === 'choice' && quiz.options) {
        quiz.options.forEach(opt => {
          result += `${opt}\n`
        })
      }
      
      result += `\n参考答案：${quiz.answer}\n`
      if (quiz.explanation) {
        result += `解析：${quiz.explanation}\n`
      }
      result += '\n---\n\n'
    })
    
    return result
  }

  getTypeName(type) {
    const names = {
      choice: '选择题',
      fill: '填空题',
      short: '简答题'
    }
    return names[type] || type
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }
}

module.exports = QuizGenCapability
