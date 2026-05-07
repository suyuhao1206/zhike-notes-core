const DB = require('../utils/db.js')
const courseService = require('./courseService.js')

function sameId(a, b) {
  return String(a || '') === String(b || '')
}

async function getCourseIdAliases(courseId) {
  const ids = new Set(courseId ? [String(courseId)] : [])
  if (!courseId) return ids

  try {
    const courses = await courseService.getCourses()
    const matchedCourse = courses.find(course => sameId(course.id, courseId) || sameId(course._id, courseId))
    if (matchedCourse) {
      if (matchedCourse.id) ids.add(String(matchedCourse.id))
      if (matchedCourse._id) ids.add(String(matchedCourse._id))
    }
  } catch (error) {
    console.warn('Failed to resolve course aliases:', error)
  }

  return ids
}

async function saveNote(note = {}) {
  const data = { ...note }
  delete data._openid
  delete data._createTime
  delete data._updateTime

  if (!data.id && !data._id) {
    data.id = `note_${Date.now()}`
  }

  if (note.id && !note._id) {
    data.id = note.id
  }

  if (note._id) {
    return DB.update('notes', note._id, data)
  }

  return DB.add('notes', data)
}

async function getNotes(courseId, options = {}) {
  const notes = await DB.list('notes', {
    limit: options.limit || 500,
    skip: options.skip || 0,
    where: options.where || {}
  })

  if (!courseId) return notes

  const courseIds = await getCourseIdAliases(courseId)
  return notes.filter(note => courseIds.has(String(note.courseId || '')))
}

async function getNoteById(noteId) {
  return DB.get('notes', noteId)
}

async function deleteNote(noteId) {
  return DB.remove('notes', noteId)
}

async function saveMistake(mistake = {}) {
  const data = { ...mistake }
  if (!data.id && !data._id) {
    data.id = `mistake_${Date.now()}`
  }
  return DB.add('mistakes', data)
}

async function getMistakes(options = {}) {
  return DB.list('mistakes', {
    limit: options.limit || 100,
    skip: options.skip || 0,
    where: options.where || {}
  })
}

async function updateMistake(mistakeId, data) {
  return DB.update('mistakes', mistakeId, data)
}

async function deleteMistake(mistakeId) {
  return DB.remove('mistakes', mistakeId)
}

async function searchNotes(query, options = {}) {
  const { courseId, tag, limit = 20 } = options
  const notes = await DB.list('notes', { limit: options.scanLimit || 300 })
  const lowerQuery = String(query || '').toLowerCase()
  const courseIds = courseId ? await getCourseIdAliases(courseId) : new Set()

  const filtered = notes.filter(note => {
    const tags = Array.isArray(note.tags) ? note.tags : []
    const matchTitle = note.title && String(note.title).toLowerCase().includes(lowerQuery)
    const matchContent = note.content && String(note.content).toLowerCase().includes(lowerQuery)
    const matchTags = tags.some(item => String(item).toLowerCase().includes(lowerQuery))

    if (!(matchTitle || matchContent || matchTags)) return false
    if (courseId && !courseIds.has(String(note.courseId || ''))) return false
    if (tag && !tags.includes(tag)) return false
    return true
  })

  return {
    query,
    notes: filtered.slice(0, limit)
  }
}

async function saveFlashcard(flashcard = {}) {
  const data = { ...flashcard }
  delete data._openid
  delete data._createTime
  delete data._updateTime

  if (!data.id && !data._id) {
    data.id = `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  if (flashcard.id && !flashcard._id) {
    data.id = flashcard.id
  }

  if (flashcard._id) {
    return DB.update('flashcards', flashcard._id, data)
  }

  return DB.add('flashcards', data)
}

async function saveFlashcards(cards = [], meta = {}) {
  const now = new Date().toISOString()
  const normalizedCards = (cards || []).map((card, index) => ({
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
  })).filter(card => card.question || card.answer)

  return Promise.all(normalizedCards.map(card => saveFlashcard(card)))
}

async function getFlashcards(noteId, options = {}) {
  const allCards = await DB.list('flashcards', {
    limit: options.limit || 500,
    skip: options.skip || 0,
    where: options.where || {}
  })

  if (!noteId) return allCards
  return allCards.filter(card => sameId(card.noteId, noteId))
}

async function getFlashcardsByCourse(courseId) {
  const allCards = await getFlashcards()
  const courseIds = await getCourseIdAliases(courseId)
  return allCards.filter(card => courseIds.has(String(card.courseId || '')))
}

async function deleteFlashcard(flashcardId) {
  return DB.remove('flashcards', flashcardId)
}

module.exports = {
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
}
