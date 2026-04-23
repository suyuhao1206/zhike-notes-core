const DB = require('../utils/db.js');
const knowledgeBase = require('../knowledge/knowledgeBase.js');

async function saveNoteSafely(note) {
  if (!note || !note.id) {
    console.error('保存笔记失败: 无效的笔记ID');
    return null;
  }

  try {
    const existingNote = await DB.get('notes', note.id);
    
    if (existingNote) {
      const updatedNote = {
        ...existingNote,
        ...note,
        updateTime: new Date().toISOString()
      };
      
      const result = await DB.update('notes', existingNote._id || note.id, updatedNote);
      console.log('✅ 笔记更新成功:', note.id);
      return result;
    } else {
      const newNote = {
        ...note,
        createTime: note.createTime || new Date().toISOString(),
        updateTime: new Date().toISOString()
      };
      
      const result = await DB.add('notes', newNote);
      console.log('✅ 新笔记创建成功:', note.id);
      return result;
    }
  } catch (error) {
    console.error('保存笔记失败:', error);
    return null;
  }
}

async function appendToNote(noteId, content, section = '') {
  try {
    const note = await DB.get('notes', noteId);
    if (!note) {
      console.error('笔记不存在:', noteId);
      return false;
    }

    let newContent = note.content || '';
    
    if (section) {
      const timestamp = new Date().toLocaleString('zh-CN');
      newContent += `\n\n---\n**${section}** (${timestamp})\n${content}`;
    } else {
      newContent += `\n\n${content}`;
    }

    const updatedNote = {
      ...note,
      content: newContent,
      updateTime: new Date().toISOString()
    };

    await DB.update('notes', note._id || noteId, updatedNote);
    console.log('✅ 内容已追加到笔记');
    return true;
  } catch (error) {
    console.error('追加内容失败:', error);
    return false;
  }
}

async function enrichNoteWithAI(noteId, aiResult, type = 'qa') {
  try {
    const note = await DB.get('notes', noteId);
    if (!note) {
      console.error('笔记不存在:', noteId);
      return false;
    }

    const timestamp = new Date().toLocaleString('zh-CN');
    let enrichedContent = note.content || '';

    switch(type) {
      case 'qa':
        enrichedContent += `\n\n---\n**AI问答记录** (${timestamp})\n问题: ${aiResult.question}\n\n回答:\n${aiResult.answer}`;
        if (!note.qaHistory) note.qaHistory = [];
        note.qaHistory.push({
          question: aiResult.question,
          answer: aiResult.answer,
          time: timestamp
        });
        break;
        
      case 'summary':
        note.summary = aiResult.summary || aiResult.text;
        note.tags = aiResult.tags || [];
        if (aiResult.mindMap) {
          note.mindMap = aiResult.mindMap;
        }
        enrichedContent += `\n\n---\n**AI总结** (${timestamp})\n${aiResult.summary || aiResult.text}`;
        break;
        
      case 'ocr':
        enrichedContent += `\n\n---\n**图片识别** (${timestamp})\n${aiResult.text}`;
        break;
        
      case 'transcription':
        enrichedContent += `\n\n---\n**录音转写** (${timestamp})\n${aiResult.text}`;
        break;
        
      case 'flashcards':
        if (!note.flashcards) note.flashcards = [];
        note.flashcards = aiResult.flashcards || [];
        enrichedContent += `\n\n---\n**生成卡片** (${timestamp})\n已生成 ${note.flashcards.length} 张记忆卡片`;
        break;
    }

    note.content = enrichedContent;
    note.updateTime = new Date().toISOString();

    await DB.update('notes', note._id || noteId, note);
    console.log(`✅ 笔记已更新: ${type}`);
    return note;
  } catch (error) {
    console.error('更新笔记失败:', error);
    return false;
  }
}

async function getNoteWithContext(noteId) {
  const note = await DB.get('notes', noteId);
  
  if (!note) {
    return null;
  }

  const context = {
    noteId: note.id,
    courseId: note.courseId,
    courseName: note.courseName,
    title: note.title,
    content: note.content,
    summary: note.summary,
    tags: note.tags,
    qaHistory: note.qaHistory || []
  };

  return context;
}

async function queryWithRAG(question, noteId, options = {}) {
  try {
    const noteContext = await getNoteWithContext(noteId);
    
    if (!noteContext) {
      return {
        answer: '未找到相关笔记内容',
        sources: []
      };
    }

    let knowledgeContext = '';
    if (knowledgeBase && knowledgeBase.search) {
      try {
        const kbResults = await knowledgeBase.search(question, {
          courseId: noteContext.courseId,
          limit: 3
        });
        
        if (kbResults && kbResults.length > 0) {
          knowledgeContext = '\n\n【官方资料参考】\n' + 
            kbResults.map((r, i) => `${i + 1}. ${r.content}`).join('\n');
        }
      } catch (kbError) {
        console.warn('知识库查询失败:', kbError);
      }
    }

    const fullContext = `
【用户笔记内容】
课程: ${noteContext.courseName}
标题: ${noteContext.title}
${noteContext.summary ? '摘要: ' + noteContext.summary : ''}

内容:
${noteContext.content}
${knowledgeContext}

问题: ${question}

请综合以上信息回答问题。如果官方资料和用户笔记都有相关内容，请优先参考官方资料，同时可以引用用户笔记作为补充。
`;

    return {
      context: fullContext,
      noteContext: noteContext,
      hasKnowledgeBase: knowledgeContext.length > 0
    };
  } catch (error) {
    console.error('RAG查询失败:', error);
    return {
      context: noteContext ? `笔记内容：\n${noteContext.content}\n\n问题：${question}` : question,
      noteContext: noteContext,
      hasKnowledgeBase: false
    };
  }
}

module.exports = {
  saveNoteSafely,
  appendToNote,
  enrichNoteWithAI,
  getNoteWithContext,
  queryWithRAG
};
