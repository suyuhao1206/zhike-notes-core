const aiService = require('../services/aiService.js')
const courseService = require('../services/courseService.js')
const noteService = require('../services/noteService.js')

function getAIConfig() {
  const app = getApp()
  return app.globalData.aiConfig || {}
}

function getCozeConfig() {
  const app = getApp()
  const cozeConfig = app.globalData.cozeConfig || {}

  return {
    baseUrl: 'cloud://aiRouter',
    token: '',
    bots: cozeConfig.bots || {}
  }
}

function callCozeBot(botType, query, options = {}) {
  return aiService.callCozeBot(botType, query, options)
}

function callCozeBotWithImage(botType, query, fileId, options = {}) {
  return aiService.callCozeBotWithImage(botType, query, fileId, options)
}

function transcribeAudio(filePath, options = {}) {
  return aiService.transcribeAudio(filePath, options)
}

function summarizeNote(content, options = {}) {
  return aiService.summarizeNote(content, options)
}

function askQuestion(question, noteContext = '', options = {}) {
  return aiService.askQuestion(question, noteContext, options)
}

function generateExam(content, config = {}, options = {}) {
  return aiService.generateExam(content, config, options)
}

function generateFlashcards(content, options = {}) {
  return aiService.generateFlashcards(content, options)
}

function generateEmergency(content, options = {}) {
  return aiService.generateEmergency(content, options)
}

function recognizeImage(filePath, options = {}) {
  return aiService.recognizeImage(filePath, options)
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
  recognizeImage,

  saveCourse: courseService.saveCourse,
  getCourses: courseService.getCourses,
  deleteCourse: courseService.deleteCourse,

  saveNote: noteService.saveNote,
  getNotes: noteService.getNotes,
  getNoteById: noteService.getNoteById,
  deleteNote: noteService.deleteNote,
  saveMistake: noteService.saveMistake,
  getMistakes: noteService.getMistakes,
  updateMistake: noteService.updateMistake,
  deleteMistake: noteService.deleteMistake,
  searchNotes: noteService.searchNotes,
  saveFlashcard: noteService.saveFlashcard,
  saveFlashcards: noteService.saveFlashcards,
  getFlashcards: noteService.getFlashcards,
  getFlashcardsByCourse: noteService.getFlashcardsByCourse,
  deleteFlashcard: noteService.deleteFlashcard
}
