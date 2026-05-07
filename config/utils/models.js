/**
 * 数据模型模块
 */

/**
 * 课程模型
 */
class Course {
  constructor(data = {}) {
    this.id = data.id || '';
    this.name = data.name || '';
    this.noteCount = data.noteCount || 0;
    this.updateTime = data.updateTime || '';
    this.createTime = data.createTime || '';
  }
}

/**
 * 笔记模型
 */
class Note {
  constructor(data = {}) {
    this.id = data.id || '';
    this.courseId = data.courseId || '';
    this.courseName = data.courseName || '';
    this.title = data.title || '';
    this.content = data.content || '';
    this.summary = data.summary || '';
    this.tags = data.tags || [];
    this.duration = data.duration || 0;
    this.createTime = data.createTime || '';
    this.updateTime = data.updateTime || '';
    this.mindMap = data.mindMap || null;
    this.qaCount = data.qaCount || 0;
  }
}

/**
 * 问题模型
 */
class Question {
  constructor(data = {}) {
    this.id = data.id || '';
    this.noteId = data.noteId || '';
    this.type = data.type || ''; // 选择题、填空题、简答题
    this.content = data.content || '';
    this.options = data.options || [];
    this.answer = data.answer || '';
    this.userAnswer = data.userAnswer || '';
    this.isCorrect = data.isCorrect || false;
  }
}

/**
 * 试卷模型
 */
class Exam {
  constructor(data = {}) {
    this.id = data.id || '';
    this.noteId = data.noteId || '';
    this.title = data.title || '';
    this.questions = data.questions || [];
    this.totalScore = data.totalScore || 100;
    this.userScore = data.userScore || 0;
    this.createTime = data.createTime || '';
    this.config = data.config || {};
  }
}

/**
 * 错题模型
 */
class Mistake {
  constructor(data = {}) {
    this.id = data.id || '';
    this.noteId = data.noteId || '';
    this.courseName = data.courseName || '';
    this.question = data.question || '';
    this.wrongAnswer = data.wrongAnswer || '';
    this.correctAnswer = data.correctAnswer || '';
    this.createTime = data.createTime || '';
    this.reviewCount = data.reviewCount || 0;
  }
}

/**
 * 背诵卡片模型
 */
class Flashcard {
  constructor(data = {}) {
    this.id = data.id || '';
    this.noteId = data.noteId || '';
    this.question = data.question || '';
    this.answer = data.answer || '';
    this.mastered = data.mastered || false;
    this.reviewCount = data.reviewCount || 0;
    this.lastReviewTime = data.lastReviewTime || '';
  }
}

/**
 * 用户模型
 */
class User {
  constructor(data = {}) {
    this.id = data.id || '';
    this.nickName = data.nickName || '';
    this.avatarUrl = data.avatarUrl || '';
    this.createTime = data.createTime || '';
    this.stats = data.stats || {
      totalNotes: 0,
      totalCourses: 0,
      studyHours: 0,
      qaCount: 0
    };
  }
}

/**
 * 答疑记录模型
 */
class QARecord {
  constructor(data = {}) {
    this.id = data.id || '';
    this.noteId = data.noteId || '';
    this.question = data.question || '';
    this.answer = data.answer || '';
    this.createTime = data.createTime || '';
  }
}

module.exports = {
  Course,
  Note,
  Question,
  Exam,
  Mistake,
  Flashcard,
  User,
  QARecord
};