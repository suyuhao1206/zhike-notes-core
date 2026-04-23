/**
 * DeepSolve能力 (Deep Solve Capability)
 * 多步骤问题解决能力，适用于复杂问题
 */

const BaseCapability = require('./baseCapability')
const aiService = require('../services/aiService')

class DeepSolveCapability extends BaseCapability {
  getManifest() {
    return {
      name: 'deep_solve',
      description: '多步骤问题解决，包括规划、调查、求解和验证',
      stages: ['planning', 'investigation', 'solution', 'verification'],
      toolsUsed: ['rag', 'reason', 'code_execution'],
      cliAliases: ['deep_solve', 'ds', 'solve'],
      configDefaults: {
        temperature: 0.5,
        maxTokens: 3000
      }
    }
  }

  async run(context, eventBus) {
    try {
      this.emitStage(eventBus, 'planning', '制定解决方案...')
      
      const plan = await this.createPlan(context)
      this.emitContent(eventBus, `问题分析：\n${plan.analysis}`)
      
      this.emitStage(eventBus, 'investigation', '收集信息...')
      
      const investigation = await this.investigate(context, plan, eventBus)
      
      this.emitStage(eventBus, 'solution', '求解中...')
      
      const solution = await this.solve(context, investigation)
      this.emitContent(eventBus, `\n解题过程：\n${solution.process}`)
      
      this.emitStage(eventBus, 'verification', '验证答案...')
      
      const verification = await this.verify(context, solution)
      
      const finalResult = this.compileResult(plan, investigation, solution, verification)
      
      context.addToHistory('assistant', finalResult.content)
      
      return {
        success: true,
        content: finalResult.content,
        metadata: {
          stages: finalResult.stages,
          confidence: verification.confidence
        }
      }
    } catch (error) {
      this.emitError(eventBus, error)
      throw error
    }
  }

  async createPlan(context) {
    const { userMessage, notebookContext } = context
    
    const systemPrompt = `你是一个问题分析专家。请分析给定的问题，并制定解决方案。

请按以下格式输出：
【问题类型】
问题的类型（如：数学计算、逻辑推理、概念理解等）

【问题分析】
问题的核心是什么？已知条件有哪些？需要求解什么？

【解决步骤】
1. 第一步...
2. 第二步...
3. ...`

    const userPrompt = notebookContext
      ? `背景资料：\n${notebookContext}\n\n问题：${userMessage}`
      : `问题：${userMessage}`

    const response = await aiService.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3
    })

    return {
      analysis: response.content,
      type: this.extractProblemType(response.content)
    }
  }

  async investigate(context, plan, eventBus) {
    const { enabledTools, knowledgeBases } = context
    const investigation = {
      ragResults: null,
      reasoningResults: null
    }

    if (enabledTools && enabledTools.includes('rag') && knowledgeBases && knowledgeBases.length > 0) {
      this.emitContent(eventBus, '从知识库检索相关信息...')
      
      const ragTool = require('../tools/ragTool')
      const tool = new ragTool()
      
      investigation.ragResults = await tool.execute({
        query: context.userMessage,
        knowledgeBase: knowledgeBases[0],
        topK: 5
      })
    }

    return investigation
  }

  async solve(context, investigation) {
    const { userMessage } = context
    const { ragResults } = investigation
    
    const messages = [
      {
        role: 'system',
        content: this.getSolveSystemPrompt()
      }
    ]
    
    if (ragResults && ragResults.success) {
      messages.push({
        role: 'system',
        content: `参考资料：\n${ragResults.content}`
      })
    }
    
    messages.push({
      role: 'user',
      content: `请详细解答以下问题：\n\n${userMessage}`
    })
    
    const response = await aiService.chat({
      messages,
      temperature: 0.5,
      maxTokens: 3000
    })

    return {
      process: response.content,
      answer: this.extractAnswer(response.content)
    }
  }

  async verify(context, solution) {
    const systemPrompt = `你是一个答案验证专家。请验证给定的解答是否正确和完整。

请按以下格式输出：
【答案】
问题的最终答案

【验证过程】
验证答案是否正确的方法和步骤

【置信度】
0-1之间的数字，表示对答案正确性的信心`

    const userPrompt = `问题：${context.userMessage}\n\n解答：\n${solution.process}`

    const response = await aiService.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3
    })

    return {
      verification: response.content,
      confidence: this.extractConfidence(response.content)
    }
  }

  compileResult(plan, investigation, solution, verification) {
    const content = `📊 问题分析
${plan.analysis}

💡 解决方案
${solution.process}

✅ 验证结果
${verification.verification}`

    return {
      content,
      stages: {
        planning: plan,
        investigation,
        solution,
        verification
      }
    }
  }

  getSolveSystemPrompt() {
    return `你是一个专业的解题专家，擅长数学、物理、化学等学科的问题求解。

解题要求：
1. 逐步推导，逻辑清晰
2. 注明每步的依据和理由
3. 如果有多种解法，选择最简洁的一种
4. 给出最终答案，并标注单位（如适用）

格式要求：
- 使用清晰的标题分隔不同步骤
- 重要公式和结论用特殊格式标注
- 如果有中间结果，要标注清楚`
  }

  extractProblemType(content) {
    if (content.includes('数学') || content.includes('计算')) return 'math'
    if (content.includes('逻辑')) return 'logic'
    if (content.includes('概念')) return 'concept'
    return 'general'
  }

  extractAnswer(content) {
    const answerMatch = content.match(/【答案】\s*([\s\S]*?)(?=\n【|$)/)
    return answerMatch ? answerMatch[1].trim() : ''
  }

  extractConfidence(content) {
    const confidenceMatch = content.match(/【置信度】\s*([\d.]+)/)
    return confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.8
  }
}

module.exports = DeepSolveCapability
