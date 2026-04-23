// pages/courses/courses.js
const api = require('../../api/api.js');
const util = require('../../utils/util.js');

Page({
  data: {
    courses: [],
    loading: false,
    isEditing: false,
    editingCourse: null,
    newCourseName: ''
  },

  onLoad() {
    this.loadCourses();
  },

  onShow() {
    this.loadCourses();
  },

  onPullDownRefresh() {
    this.loadCourses().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 加载课程列表
  async loadCourses() {
    this.setData({ loading: true });

    try {
      const courses = await api.getCourses();

      // 获取每个课程的笔记数量
      const allNotes = await api.getNotes();

      const coursesWithCount = courses.map(course => {
        const noteCount = allNotes.filter(n => n.courseId === course.id).length;
        return {
          ...course,
          noteCount,
          lastStudyTime: course.updateTime
        };
      });

      this.setData({
        courses: coursesWithCount,
        loading: false
      });
    } catch (error) {
      console.error('加载课程失败:', error);
      this.setData({ loading: false });
    }
  },

  // 显示添加课程弹窗
  showAddModal() {
    this.setData({
      isEditing: true,
      editingCourse: null,
      newCourseName: ''
    });
  },

  // 显示编辑弹窗
  showEditModal(e) {
    const course = e.currentTarget.dataset.course;
    this.setData({
      isEditing: true,
      editingCourse: course,
      newCourseName: course.name
    });
  },

  // 隐藏弹窗
  hideModal() {
    this.setData({
      isEditing: false,
      editingCourse: null,
      newCourseName: ''
    });
  },

  // 输入课程名
  onNameInput(e) {
    this.setData({ newCourseName: e.detail.value });
  },

  // 保存课程
  async saveCourse() {
    const name = this.data.newCourseName.trim();

    if (!name) {
      wx.showToast({ title: '请输入课程名称', icon: 'none' });
      return;
    }

    try {
      if (this.data.editingCourse) {
        // 更新课程
        await api.saveCourse({
          ...this.data.editingCourse,
          name
        });
        wx.showToast({ title: '更新成功', icon: 'success' });
      } else {
        // 添加新课程
        await api.saveCourse({
          name,
          createTime: new Date().toISOString()
        });
        wx.showToast({ title: '添加成功', icon: 'success' });
      }

      this.hideModal();
      this.loadCourses();
    } catch (error) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // 删除课程
  async deleteCourse(e) {
    const courseId = e.currentTarget.dataset.id;

    // 检查是否有笔记
    const notes = await api.getNotes(courseId);
    if (notes.length > 0) {
      wx.showModal({
        title: '无法删除',
        content: '该课程下有笔记，请先删除笔记',
        showCancel: false
      });
      return;
    }

    const confirmed = await util.confirm('删除后无法恢复，确定删除吗？', '确认删除');
    if (confirmed) {
      try {
        // 从本地存储删除
        let courses = wx.getStorageSync('courses') || [];
        courses = courses.filter(c => c.id != courseId);
        wx.setStorageSync('courses', courses);

        wx.showToast({ title: '删除成功', icon: 'success' });
        this.loadCourses();
      } catch (error) {
        wx.showToast({ title: '删除失败', icon: 'none' });
      }
    }
  },

  // 查看课程笔记
  viewCourseNotes(e) {
    const courseId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/notes/notes?courseId=${courseId}`
    });
  }
});
