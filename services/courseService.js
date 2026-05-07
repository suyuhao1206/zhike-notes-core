const DB = require('../utils/db.js')

async function saveCourse(course = {}) {
  const data = { ...course }
  delete data._openid
  delete data._createTime
  delete data._updateTime

  if (!data.id && !data._id) {
    data.id = `course_${Date.now()}`
  }

  if (course.id && !course._id) {
    data.id = course.id
  }

  if (course._id) {
    return DB.update('courses', course._id, data)
  }

  return DB.add('courses', data)
}

async function getCourses(options = {}) {
  return DB.list('courses', {
    limit: options.limit || 100,
    skip: options.skip || 0,
    where: options.where || {}
  })
}

async function deleteCourse(courseId) {
  return DB.remove('courses', courseId)
}

module.exports = {
  saveCourse,
  getCourses,
  deleteCourse
}
